export default function Loading() {
    return (
        <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <span className="ml-3 text-sm text-muted-foreground">加载中...</span>
        </div>
    )
}
