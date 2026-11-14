import type React from 'react';
import { useId, useRef, useState } from 'react';

export interface StudioTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export interface StudioTabsProps {
  label: string;
  tabs: StudioTabItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
  listClassName?: string;
  panelsClassName?: string;
  renderPanels?: boolean;
}

export function StudioTabs({
  label,
  tabs,
  activeId: controlledId,
  onChange,
  className,
  listClassName,
  panelsClassName,
  renderPanels = true,
}: StudioTabsProps) {
  const baseId = useId();
  const [uncontrolledId, setUncontrolledId] = useState(tabs[0]?.id ?? '');
  const activeId = controlledId ?? uncontrolledId;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (id: string) => {
    if (controlledId === undefined) {
      setUncontrolledId(id);
    }
    onChange?.(id);
  };

  const handleKeyDown = (idx: number, ev: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextIdx = idx;
    if (ev.key === 'ArrowRight') {
      nextIdx = (idx + 1) % tabs.length;
    } else if (ev.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + tabs.length) % tabs.length;
    } else if (ev.key === 'Home') {
      nextIdx = 0;
    } else if (ev.key === 'End') {
      nextIdx = tabs.length - 1;
    } else {
      return;
    }

    ev.preventDefault();
    const target = tabs[nextIdx];
    if (target) {
      selectTab(target.id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <div className={className ? `studio-tabs ${className}` : 'studio-tabs'}>
      <div
        role="tablist"
        aria-label={label}
        className={listClassName ? `studio-tablist ${listClassName}` : 'studio-tablist'}
      >
        {tabs.map((tab, idx) => {
          const isSelected = tab.id === activeId;
          const tabDomId = `${baseId}-tab-${tab.id}`;
          const panelDomId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tabDomId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={renderPanels ? panelDomId : undefined}
              tabIndex={isSelected ? 0 : -1}
              className="studio-tab-trigger"
              onClick={() => selectTab(tab.id)}
              onKeyDown={(ev) => handleKeyDown(idx, ev)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {renderPanels ? (
        <div className={panelsClassName ? `studio-tabpanels ${panelsClassName}` : 'studio-tabpanels'}>
          {tabs.map((tab) => {
            const isSelected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                id={`${baseId}-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-${tab.id}`}
                hidden={!isSelected}
                className="studio-tabpanel"
              >
                {tab.content}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
