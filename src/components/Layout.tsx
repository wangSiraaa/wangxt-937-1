import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  FileText,
  UserMinus,
  Trophy,
} from "lucide-react";

const navItems = [
  { to: "/", label: "首页", icon: Home },
  { to: "/register", label: "选手报名", icon: ClipboardList },
  { to: "/payment", label: "财务缴费", icon: CreditCard },
  { to: "/grouping", label: "裁判分组", icon: LayoutGrid },
  { to: "/roster", label: "分组名单", icon: FileText },
  { to: "/withdrawal", label: "退赛处理", icon: UserMinus },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <aside className="flex w-60 flex-shrink-0 flex-col bg-primary text-white">
        <div className="flex h-16 items-center gap-3 px-5">
          <Trophy className="h-7 w-7 text-accent" />
          <span className="text-lg font-bold tracking-wide">赛事管理系统</span>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-primary-100 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-primary-200">
          © 2026 赛事管理系统
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <h1 className="text-lg font-semibold text-primary">赛事管理系统</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
