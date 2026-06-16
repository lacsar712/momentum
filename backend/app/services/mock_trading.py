from datetime import date, datetime
from sqlmodel import select, Session
from sqlalchemy.exc import IntegrityError
from app.models import MockAccount, MockTrade, MockPosition, Stock, StockSnapshot, DailyPrice
from app.schemas import MockAccountSummary, MockPositionItem, MockTradeItem

COMMISSION_RATE = 0.00025
DEFAULT_CAPITAL = 1000000.0


def get_or_create_account(session: Session, user_id: int) -> MockAccount:
    account = session.exec(
        select(MockAccount).where(MockAccount.user_id == user_id)
    ).first()
    if account:
        return account

    account = MockAccount(
        user_id=user_id,
        initial_capital=DEFAULT_CAPITAL,
        available_cash=DEFAULT_CAPITAL,
        cumulative_pnl=0.0,
    )
    session.add(account)
    try:
        session.commit()
        session.refresh(account)
    except IntegrityError:
        # 并发请求可能已先创建了账户，回滚后重新读取已存在的记录
        session.rollback()
        account = session.exec(
            select(MockAccount).where(MockAccount.user_id == user_id)
        ).first()
    return account


def get_latest_price(session: Session, stock_id: int) -> float | None:
    snapshot = session.exec(
        select(StockSnapshot).where(StockSnapshot.stock_id == stock_id)
    ).first()
    if snapshot:
        return snapshot.close
    price = session.exec(
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock_id)
        .order_by(DailyPrice.trade_date.desc())
        .limit(1)
    ).first()
    if price:
        return price.close
    return None


def get_account_summary(session: Session, user_id: int) -> MockAccountSummary:
    account = get_or_create_account(session, user_id)
    positions = session.exec(
        select(MockPosition).where(MockPosition.account_id == account.id)
    ).all()

    position_market_value = 0.0
    total_cost = 0.0
    for pos in positions:
        price = get_latest_price(session, pos.stock_id)
        if price:
            position_market_value += price * pos.quantity
        total_cost += pos.avg_cost * pos.quantity

    total_assets = account.available_cash + position_market_value
    cumulative_pnl = total_assets - account.initial_capital

    today_pnl = 0.0
    for pos in positions:
        price = get_latest_price(session, pos.stock_id)
        if price:
            today_trades = session.exec(
                select(DailyPrice)
                .where(DailyPrice.stock_id == pos.stock_id)
                .order_by(DailyPrice.trade_date.desc())
                .limit(2)
            ).all()
            if len(today_trades) >= 2:
                prev_close = today_trades[1].close
                today_pnl += (price - prev_close) * pos.quantity

    return MockAccountSummary(
        account_id=account.id,
        initial_capital=account.initial_capital,
        available_cash=round(account.available_cash, 2),
        position_market_value=round(position_market_value, 2),
        total_assets=round(total_assets, 2),
        cumulative_pnl=round(cumulative_pnl, 2),
        today_pnl=round(today_pnl, 2),
    )


def place_order(session: Session, user_id: int, symbol: str, direction: str, quantity: int) -> dict:
    if direction not in ("buy", "sell"):
        raise ValueError("方向必须为 buy 或 sell")
    if quantity <= 0:
        raise ValueError("数量必须大于 0")

    stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
    if not stock:
        raise ValueError("股票不存在")

    account = get_or_create_account(session, user_id)
    price = get_latest_price(session, stock.id)
    if price is None:
        raise ValueError("无法获取最新价格")

    amount = price * quantity
    commission = round(amount * COMMISSION_RATE, 2)

    if direction == "buy":
        total_cost = amount + commission
        if account.available_cash < total_cost:
            raise ValueError(f"可用资金不足，需要 {total_cost:.2f}，可用 {account.available_cash:.2f}")
        account.available_cash = round(account.available_cash - total_cost, 2)

        position = session.exec(
            select(MockPosition).where(
                MockPosition.account_id == account.id,
                MockPosition.stock_id == stock.id,
            )
        ).first()
        if position:
            total_qty = position.quantity + quantity
            position.avg_cost = round((position.avg_cost * position.quantity + amount) / total_qty, 4)
            position.quantity = total_qty
            position.updated_at = datetime.utcnow()
        else:
            position = MockPosition(
                account_id=account.id,
                stock_id=stock.id,
                quantity=quantity,
                avg_cost=round(price, 4),
            )
            session.add(position)

    elif direction == "sell":
        position = session.exec(
            select(MockPosition).where(
                MockPosition.account_id == account.id,
                MockPosition.stock_id == stock.id,
            )
        ).first()
        if not position or position.quantity < quantity:
            raise ValueError(f"持仓不足，当前持有 {position.quantity if position else 0} 股")
        position.quantity -= quantity
        account.available_cash = round(account.available_cash + amount - commission, 2)
        if position.quantity == 0:
            session.delete(position)
        else:
            position.updated_at = datetime.utcnow()

        sell_pnl = (price - (position.avg_cost if position and position.quantity > 0 else price)) * quantity
        account.cumulative_pnl = round(account.cumulative_pnl + sell_pnl, 2)

    trade = MockTrade(
        account_id=account.id,
        stock_id=stock.id,
        direction=direction,
        quantity=quantity,
        price=price,
        commission=commission,
        status="filled",
    )
    session.add(trade)
    session.commit()
    session.refresh(trade)

    return {
        "trade_id": trade.id,
        "symbol": symbol,
        "name": stock.name,
        "direction": direction,
        "quantity": quantity,
        "price": price,
        "commission": commission,
        "amount": round(amount, 2),
        "status": "filled",
        "traded_at": trade.traded_at.isoformat(),
    }


def cancel_order(session: Session, user_id: int, trade_id: int) -> dict:
    account = get_or_create_account(session, user_id)
    trade = session.exec(
        select(MockTrade).where(
            MockTrade.id == trade_id,
            MockTrade.account_id == account.id,
        )
    ).first()
    if not trade:
        raise ValueError("订单不存在")
    if trade.status != "pending":
        raise ValueError("仅未成交订单可撤单")
    trade.status = "cancelled"
    session.commit()
    return {"status": "ok", "trade_id": trade_id}


def get_positions(session: Session, user_id: int) -> list[MockPositionItem]:
    account = get_or_create_account(session, user_id)
    positions = session.exec(
        select(MockPosition).where(MockPosition.account_id == account.id)
    ).all()

    result = []
    for pos in positions:
        stock = session.exec(select(Stock).where(Stock.id == pos.stock_id)).first()
        if not stock:
            continue
        current_price = get_latest_price(session, pos.stock_id) or pos.avg_cost
        market_value = current_price * pos.quantity
        floating_pnl = (current_price - pos.avg_cost) * pos.quantity
        floating_pnl_pct = ((current_price - pos.avg_cost) / pos.avg_cost * 100) if pos.avg_cost > 0 else 0.0
        result.append(MockPositionItem(
            stock_id=pos.stock_id,
            symbol=stock.symbol,
            name=stock.name,
            quantity=pos.quantity,
            avg_cost=round(pos.avg_cost, 4),
            current_price=round(current_price, 2),
            market_value=round(market_value, 2),
            floating_pnl=round(floating_pnl, 2),
            floating_pnl_pct=round(floating_pnl_pct, 2),
        ))

    result.sort(key=lambda x: x.floating_pnl_pct)
    return result


def get_available_cash(session: Session, user_id: int) -> dict:
    account = get_or_create_account(session, user_id)
    return {"available_cash": round(account.available_cash, 2)}


def get_trade_history(
    session: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
    direction: str | None = None,
    symbol: str | None = None,
) -> dict:
    account = get_or_create_account(session, user_id)
    query = select(MockTrade).where(MockTrade.account_id == account.id)

    if direction:
        query = query.where(MockTrade.direction == direction)
    if symbol:
        stock = session.exec(select(Stock).where(Stock.symbol == symbol)).first()
        if stock:
            query = query.where(MockTrade.stock_id == stock.id)

    all_trades = session.exec(query.order_by(MockTrade.traded_at.desc())).all()
    total = len(all_trades)

    start = (page - 1) * page_size
    end = start + page_size
    page_trades = all_trades[start:end]

    items = []
    for t in page_trades:
        stock = session.exec(select(Stock).where(Stock.id == t.stock_id)).first()
        items.append(MockTradeItem(
            id=t.id,
            symbol=stock.symbol if stock else "",
            name=stock.name if stock else "",
            direction=t.direction,
            quantity=t.quantity,
            price=t.price,
            commission=t.commission,
            status=t.status,
            traded_at=t.traded_at,
        ))

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


def get_portfolio_nav(session: Session, user_id: int) -> dict:
    account = get_or_create_account(session, user_id)
    positions = session.exec(
        select(MockPosition).where(MockPosition.account_id == account.id)
    ).all()

    position_market_value = 0.0
    position_details = []
    for pos in positions:
        stock = session.exec(select(Stock).where(Stock.id == pos.stock_id)).first()
        if not stock:
            continue
        price = get_latest_price(session, pos.stock_id) or pos.avg_cost
        mv = price * pos.quantity
        position_market_value += mv
        position_details.append({
            "symbol": stock.symbol,
            "name": stock.name,
            "quantity": pos.quantity,
            "avg_cost": pos.avg_cost,
            "current_price": price,
            "market_value": round(mv, 2),
            "floating_pnl": round((price - pos.avg_cost) * pos.quantity, 2),
        })

    total_assets = account.available_cash + position_market_value
    nav = total_assets / account.initial_capital if account.initial_capital > 0 else 1.0

    return {
        "nav": round(nav, 4),
        "total_assets": round(total_assets, 2),
        "available_cash": round(account.available_cash, 2),
        "position_market_value": round(position_market_value, 2),
        "positions": position_details,
    }


def reset_account(session: Session, user_id: int, initial_capital: float = DEFAULT_CAPITAL) -> dict:
    account = session.exec(
        select(MockAccount).where(MockAccount.user_id == user_id)
    ).first()
    if not account:
        account = MockAccount(user_id=user_id, initial_capital=initial_capital, available_cash=initial_capital)
        session.add(account)
        session.commit()
        return {"status": "ok", "message": "账户已创建"}

    trades = session.exec(
        select(MockTrade).where(MockTrade.account_id == account.id)
    ).all()
    for t in trades:
        session.delete(t)

    positions = session.exec(
        select(MockPosition).where(MockPosition.account_id == account.id)
    ).all()
    for p in positions:
        session.delete(p)

    account.initial_capital = initial_capital
    account.available_cash = initial_capital
    account.cumulative_pnl = 0.0
    session.commit()

    return {"status": "ok", "message": "账户已重置"}
