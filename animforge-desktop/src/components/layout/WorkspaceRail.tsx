import type React from 'react';
import type { WorkspaceId } from '../../types';
import {
  AgentsIcon,
  AssetsIcon,
  CharactersIcon,
  DiagnosticsIcon,
  HomeIcon,
  ProjectsIcon,
  RenderIcon,
  SettingsIcon,
  StoryIcon,
  StudioIcon,
} from '../ui/Icons';

export interface WorkspaceNavEntry {
  id: WorkspaceId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  group: 'core' | 'production' | 'system';
}

export const WORKSPACE_NAV_ENTRIES: WorkspaceNavEntry[] = [
  { id: 'home', label: 'Home', shortcut: 'Alt+1', icon: <HomeIcon size={17} />, group: 'core' },
  { id: 'projects', label: 'Projects', shortcut: 'Alt+2', icon: <ProjectsIcon size={17} />, group: 'core' },
  { id: 'studio', label: 'Animation Studio', shortcut: 'Alt+4', icon: <StudioIcon size={17} />, group: 'core' },
  { id: 'story', label: 'Story & Scenes', shortcut: 'Alt+3', icon: <StoryIcon size={17} />, group: 'production' },
  { id: 'characters', label: 'Character Studio', shortcut: 'Alt+5', icon: <CharactersIcon size={17} />, group: 'production' },
  { id: 'assets', label: 'Asset Library', shortcut: 'Alt+6', icon: <AssetsIcon size={17} />, group: 'production' },
  { id: 'render', label: 'Render & Export', shortcut: 'Alt+7', icon: <RenderIcon size={17} />, group: 'production' },
  { id: 'agents', label: 'Agent Center', shortcut: 'Alt+0', icon: <AgentsIcon size={17} />, group: 'system' },
  { id: 'settings', label: 'Settings', shortcut: 'Alt+9', icon: <SettingsIcon size={17} />, group: 'system' },
  { id: 'diagnostics', label: 'Diagnostics', shortcut: 'Alt+8', icon: <DiagnosticsIcon size={17} />, group: 'system' },
];

export interface WorkspaceRailProps {
  activeWorkspace: WorkspaceId;
  onSelect: (id: WorkspaceId) => void;
}

export function WorkspaceRail({ activeWorkspace, onSelect }: WorkspaceRailProps) {
  const core = WORKSPACE_NAV_ENTRIES.filter((e) => e.group === 'core');
  const production = WORKSPACE_NAV_ENTRIES.filter((e) => e.group === 'production');
  const system = WORKSPACE_NAV_ENTRIES.filter((e) => e.group === 'system');

  const renderGroup = (items: WorkspaceNavEntry[]) =>
    items.map((item) => (
      <button
        key={item.id}
        type="button"
        className="rail-icon-btn"
        aria-label={item.label}
        title={`${item.label} (${item.shortcut})`}
        aria-current={activeWorkspace === item.id ? 'page' : undefined}
        onClick={() => onSelect(item.id)}
      >
        {item.icon}
      </button>
    ));

  return (
    <aside className="workbench-rail">
      <nav aria-label="Studio Workspaces" className="workbench-rail-nav">
        <div className="rail-group">{renderGroup(core)}</div>
        <div className="rail-divider" aria-hidden="true" />
        <div className="rail-group">{renderGroup(production)}</div>
        <div className="rail-spacer" />
        <div className="rail-divider" aria-hidden="true" />
        <div className="rail-group">{renderGroup(system)}</div>
      </nav>
    </aside>
  );
}
