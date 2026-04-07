import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Terminal,
  LayoutDashboard,
  Plus,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}

function NavItem({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-mono font-medium transition-colors relative group',
          isActive
            ? 'text-accent bg-accent/10 border-l-2 border-accent pl-[10px]'
            : 'text-muted hover:text-foreground hover:bg-surface-2 border-l-2 border-transparent pl-[10px]'
        )
      }
    >
      <span className="flex-shrink-0 w-4 h-4">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside id="tour-sidebar" className="w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col h-full">
      {/* Logo / App Name */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
            <Terminal className="w-4 h-4 text-accent" />
          </div>
          <div className="flex flex-col">
            <span className="text-foreground font-mono font-semibold text-sm leading-tight">
              AI Dev
            </span>
            <span className="text-muted font-mono text-xs leading-tight">
              Workspace
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        <p className="text-muted uppercase text-xs tracking-widest px-3 mb-2 font-mono">
          Navigation
        </p>
        <NavItem
          to="/"
          end
          icon={<LayoutDashboard className="w-4 h-4" />}
          label="Dashboard"
        />
        <NavItem
          to="/new"
          icon={<Plus className="w-4 h-4" />}
          label="New Task"
        />
      </nav>

      {/* Bottom Links */}
      <div className="px-3 py-4 border-t border-border">
        <a
          href="https://github.com/daytonaio/daytona"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-mono font-medium text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          <span>Daytona Docs</span>
        </a>
      </div>
    </aside>
  );
}
