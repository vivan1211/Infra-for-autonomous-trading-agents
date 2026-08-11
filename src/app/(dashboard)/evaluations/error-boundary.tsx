"use client";

import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class EvalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-4">
          <h2 className="text-[18px] font-semibold text-red-400">Runtime Error</h2>
          <p className="text-[13px] text-white/70">Copy the box below and share it for debugging:</p>
          <textarea
            readOnly
            className="w-full h-[300px] bg-black border border-red-500/30 rounded-lg p-4 text-[12px] text-red-300 font-mono resize-y focus:outline-none"
            value={`${this.state.error.name}: ${this.state.error.message}\n\n${this.state.error.stack ?? ""}`}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${this.state.error!.name}: ${this.state.error!.message}\n\n${this.state.error!.stack ?? ""}`
              );
            }}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[13px] text-white hover:bg-white/20 transition"
          >
            Copy to clipboard
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            className="ml-3 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[13px] text-white hover:bg-white/20 transition"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
