import React from 'react'
import Modal from './Modal'

interface ErrorBoundaryState {
    hasError: boolean
    errorMessage: string
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
    constructor(props: React.PropsWithChildren) {
        super(props)
        this.state = { hasError: false, errorMessage: '' }
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, errorMessage: error.message }
    }

    render() {
        if (this.state.hasError) {
            return (
                <Modal
                    open={true}
                    title="系统异常"
                    onClose={() => this.setState({ hasError: false, errorMessage: '' })}
                    footer={(
                        <div className="flex justify-end">
                            <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => this.setState({ hasError: false, errorMessage: '' })}>刷新页面</button>
                        </div>
                    )}
                >
                    <p className="text-sm text-muted-foreground">系统运行出现异常，请尝试刷新或稍后再试。</p>
                    <p className="mt-2 text-xs text-muted-foreground">{this.state.errorMessage}</p>
                </Modal>
            )
        }
        return this.props.children
    }
}
