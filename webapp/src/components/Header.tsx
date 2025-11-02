import { Link } from "@tanstack/react-router";

import {
  BarChart3,
  Home,
  LogIn,
  LogOut,
  Menu,
  TrendingUp,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuth();

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
            <div className="flex items-center gap-3">
              <Link
                to="/feed"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
              >
                <Users size={18} />
                <span className="hidden sm:inline">Public Feed</span>
              </Link>

              {user && (
                <>
                  <Link
                    to="/friends"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    title="Friends"
                  >
                    <Users size={18} />
                    <span className="hidden sm:inline">Friends</span>
                  </Link>
                  <Link
                    to="/leaderboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    title="Leaderboard"
                  >
                    <Trophy size={18} />
                    <span className="hidden sm:inline">Leaderboard</span>
                  </Link>
                </>
              )}

              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                  >
                    <User size={18} />
                    <span className="hidden sm:inline">{user.username}</span>
                  </button>

                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                        <div className="p-3 border-b border-gray-200">
                          <p className="text-sm font-medium text-gray-900">{user.username}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <Link
                          to={`/users/${user.username}`}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <User size={16} />
                          Profile
                        </Link>
                        <Link
                          to="/friends"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <Users size={16} />
                          Friends
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            setUserMenuOpen(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <LogOut size={16} />
                          Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <LogIn size={18} />
                  <span className="hidden sm:inline">Sign In</span>
                </Link>
              )}
            </div>
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

          {user && (
            <>
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
            </>
          )}

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

          {user && (
            <>
              <Link
                to="/friends"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
                activeProps={{
                  className:
                    "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
                }}
              >
                <Users size={20} />
                <span className="font-medium">Friends</span>
              </Link>
              <Link
                to="/leaderboard"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors mb-1"
                activeProps={{
                  className:
                    "flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-1 border border-blue-200",
                }}
              >
                <Trophy size={20} />
                <span className="font-medium">Leaderboard</span>
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
