import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router"
import { authClient, signOut } from "@/lib/auth-client"
import { useEffect, useState } from "react"
import {
  Zap,
  LayoutDashboard,
  BookOpen,
  Gamepad2,
  LogOut,
  Menu,
  X,
} from "lucide-react"

export const Route = createFileRoute(`/admin`)({
  component: AdminLayout,
  ssr: false,
})

function AdminLayout() {
  const [session, setSession] = useState<{ user?: { name?: string; email?: string } } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    authClient.getSession().then((result) => {
      if (!result.data?.session) {
        window.location.href = `/login`
      } else {
        setSession(result.data)
        setIsLoading(false)
      }
    })
  }, [])

  const handleSignOut = async () => {
    await signOut()
    window.location.href = `/login`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-buzzy-gradient-soft flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  const navItems = [
    { href: `/admin`, icon: LayoutDashboard, label: `Dashboard` },
    { href: `/admin/banks`, icon: BookOpen, label: `Question Banks` },
    { href: `/admin/sessions`, icon: Gamepad2, label: `Game Sessions` },
  ]

  const isActive = (href: string) => {
    if (href === `/admin`) {
      return location.pathname === `/admin`
    }
    return location.pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-buzzy-gradient-soft">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white shadow-md px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl hover:bg-gray-100"
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-buzzy-gradient flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-text-dark">BuzzIn</span>
          </div>
        </div>
      </div>

      {/* Sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 lg:translate-x-0 ${
          isSidebarOpen ? `translate-x-0` : `-translate-x-full`
        }`}
      >
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-buzzy-gradient flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-text-dark">BuzzIn</h1>
              <p className="text-xs text-text-muted">Admin Panel</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={isActive(item.href) ? `sidebar-link-active` : `sidebar-link`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="avatar-buzzy text-sm">
              {session?.user?.name?.[0]?.toUpperCase() || `?`}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-dark truncate">
                {session?.user?.name || `Admin`}
              </p>
              <p className="text-xs text-text-muted truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-text-muted hover:bg-gray-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
