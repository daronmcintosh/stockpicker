import type { ErrorComponentProps } from "@tanstack/react-router";

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8 border border-gray-200">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-label="Error icon"
            >
              <title>Error</title>
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Something went wrong
          </h1>

          <p className="text-gray-600 text-center mb-6">
            An unexpected error occurred. Please try again.
          </p>

          {error instanceof Error && (
            <div className="bg-gray-50 rounded-md p-4 mb-6 border border-gray-200">
              <p className="text-sm font-mono text-gray-700 break-words">{error.message}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors"
            >
              Try again
            </button>
            <a
              href="/"
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2.5 px-4 rounded-md transition-colors text-center"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
