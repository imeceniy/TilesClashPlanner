const Tool = ({ name, icon, label, className = "" }: { name: string; icon?: string; label: string; className?: string }) => (
  <button className={`tool ${className}`.trim()} data-tool={name} title={label} aria-label={label} aria-pressed={name === "select"}>
    <b>{icon}</b>
    <span>{label}</span>
  </button>
);

export function Workspace() {
  return (
    <main className="workspace">
      <nav id="toolbar" className="toolbar" aria-label="Инструменты карты">
        <Tool name="select" icon="⌁" label="Выбор" className="active" />
        <div className="tool-divider" />
        <Tool name="captured" label="Захвачено" className="captured" />
        <Tool name="hold" label="Удержать" className="hold" />
        <Tool name="priority" label="Приоритет" className="priority" />
        <Tool name="secondary" label="Не бьём" className="secondary" />
        <Tool name="enemy" label="Противник" className="enemy" />
        <Tool name="neutral" label="Нейтрально" className="neutral" />
        <Tool name="ignore" icon="×" label="Не учитывать" className="ignore" />
        <div className="tool-divider" />
        <Tool name="arrow" icon="➜" label="Маршрут" />
        <Tool name="label" icon="T" label="Текст" />
        <Tool name="marker" icon="⌖" label="Маркер" />
        <Tool name="noAttack" label="1 удар" className="no-attack" />
        <Tool name="allianceTag" icon="♜" label="Союз" className="copper-only" />
        <Tool name="refusalTag" icon="×" label="Отказ" className="refusal copper-only" />
        <button id="finishRoute" className="finish-route" hidden>
          ✓ Завершить маршрут
        </button>
      </nav>

      <div id="toolGuidance" className="tool-guidance" aria-live="polite">
        Выбор: нажмите территорию, чтобы открыть её меню.
      </div>

      <section className="score-panel" aria-label="Очки плана" aria-live="polite">
        <div className="score-card captured-score">
          <span>Уже захвачено</span>
          <strong id="capturedScore">0</strong>
          <small id="capturedScoreDetails">0 территорий</small>
        </div>
        <div className="score-card theoretical-score">
          <span>С планируемыми целями</span>
          <strong id="theoreticalScore">0</strong>
          <small id="theoreticalScoreDetails">0 территорий</small>
        </div>
      </section>

      <section id="mapFrame" className="map-frame">
        <div className="map-caption">
          <div>
            <span className="live-dot" />
            <span id="planTitle">DAY 1</span>
          </div>
          <small id="mapCaptionName">GENE CLASH · OIL CLASH</small>
        </div>
        <div id="mapCanvas" role="application" aria-label="Интерактивная карта Gene Clash на Konva Canvas" />
        <div id="mapEmpty" className="map-loading">
          <span />
          Загружаем карту…
        </div>
        <div id="contextMenu" className="context-menu" hidden />
        <div id="basePicker" className="base-picker" hidden>
          <label htmlFor="baseAllianceSelect">Назначить союз</label>
          <strong id="basePickerTitle">База</strong>
          <select id="baseAllianceSelect" />
          <small>Цвет базы изменится на цвет союза</small>
        </div>
        <div className="zoom-controls">
          <button id="zoomIn" title="Приблизить">
            ＋
          </button>
          <span id="zoomValue">100%</span>
          <button id="zoomOut" title="Отдалить">
            −
          </button>
          <i />
          <button id="fitMap">Вся карта</button>
          <button id="actualSize">100%</button>
        </div>
        <div id="routeHint" className="route-hint" hidden>
          <strong>Маршрут</strong>
          <span>Выберите первую территорию</span>
          <button id="cancelRoute">×</button>
        </div>
        <div id="startHint" className="route-hint start-hint" hidden>
          <strong>Старт союза</strong>
          <span>Выберите цветной круг</span>
          <button id="cancelStart">×</button>
        </div>
        <div id="toast" className="toast" hidden />
      </section>

      <footer className="statusbar">
        <div>
          <span id="territoryCount">165 объектов</span>
          <i />
          <span id="selectionInfo">Ничего не выбрано</span>
        </div>
        <div>
          <span>Колесо — масштаб</span>
          <span>Пробел + drag — карта</span>
          <span>Ctrl+Z — отменить</span>
          <span className="copyright">© Задов Продакшн</span>
        </div>
      </footer>
    </main>
  );
}
