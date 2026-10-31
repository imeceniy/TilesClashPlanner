export function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>Tiles Clash</strong>
          <small>TACTICAL PLANNER</small>
        </div>
      </div>
      <div className="plan-switcher">
        <span className="eyebrow">КАРТА</span>
        <select id="mapSelect" aria-label="Событие и карта" />
        <i className="switcher-divider" />
        <span className="eyebrow">ТЕКУЩИЙ ПЛАН</span>
        <select id="planSelect" aria-label="Текущий план" />
        <button id="clonePlan" className="icon-button" title="Создать новый день из текущего">
          ＋
        </button>
      </div>
      <div className="header-actions">
        <span id="readOnlyBadge" className="readonly-badge" hidden>
          Только просмотр
        </span>
        <button id="collaborationBtn" className="icon-button collaboration-button" title="Совместная работа">
          Команда
        </button>
        <button id="mobileSidebarToggle" className="icon-button mobile-sidebar-toggle" title="Открыть панель">
          ☰
        </button>
        <button id="helpBtn" className="icon-button help-button" title="Помощь">
          Помощь
        </button>
        <span id="saveState" className="save-state">
          <i /> Сохранено
        </span>
        <button id="undoBtn" className="icon-button" title="Отменить (Ctrl+Z)">
          ↶
        </button>
        <button id="redoBtn" className="icon-button" title="Повторить (Ctrl+Y)">
          ↷
        </button>
        <button id="exportPng" className="primary-button">
          <span>⇩</span> Экспорт PNG
        </button>
      </div>
    </header>
  );
}
