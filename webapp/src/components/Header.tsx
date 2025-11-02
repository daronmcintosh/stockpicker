import { Link } from "@tanstack/react-router";

import { BarChart3, Home, Menu, TrendingUp, Users, X } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <Link to="/" className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
                  StockPicker
                </h1>
              </Link>
            </div>
            <Link
              to="/feed"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
            >
              <Users size={18} />
              <span className="hidden sm:inline">Public Feed</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out shadow-xl flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Navigation</h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
            activeProps={{
              className:
                "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/strategies"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
            activeProps={{
              className:
                "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
            }}
          >
            <TrendingUp size={20} />
            <span className="font-medium">Strategies</span>
          </Link>

          <Link
            to="/predictions"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
            activeProps={{
              className:
                "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
            }}
          >
            <BarChart3 size={20} />
            <span className="font-medium">Predictions</span>
          </Link>

          <Link
            to="/feed"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
            activeProps={{
              className:
                "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
            }}
          >
            <Users size={20} />
            <span className="font-medium">Public Feed</span>
          </Link>
        </nav>
      </aside>
    </>
  );
}
