const Toggle = ({ id, label, checked = true }: { id: string; label: string; checked?: boolean }) => (
  <label className="toggle-row">
    <span>{label}</span>
    <input id={id} type="checkbox" defaultChecked={checked} />
    <i />
  </label>
);

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-section search-section">
        <label htmlFor="searchInput">БЫСТРЫЙ ПОИСК</label>
        <div className="search-box">
          <span>⌕</span>
          <input id="searchInput" autoComplete="off" placeholder="Найти объект, например M30" />
          <kbd>↵</kbd>
        </div>
        <div id="searchResults" className="search-results" hidden />
      </div>

      <div className="sidebar-section">
        <div className="section-heading">
          <span>СОЮЗЫ</span>
          <button id="addAlliance" className="text-button">
            ＋ Добавить
          </button>
        </div>
        <div id="allianceList" className="alliance-list" />
        <p className="assignment-tip">Нажмите союз, чтобы выбрать его для инструментов «Союз», «Противник» и «Маркер».</p>
      </div>

      <div id="territoryAssignmentsSection" className="sidebar-section territory-assignments" hidden>
        <div className="section-heading">
          <span>НАЗНАЧЕНИЯ БАСТИОНОВ</span>
        </div>
        <p className="assignment-tip">Инструмент «Союз» добавляет выбранный альянс к точке. На одной точке может быть несколько меток.</p>
        <div id="territoryAssignmentsList" className="territory-assignments-list" />
      </div>

      <div className="sidebar-section route-planner-section">
        <div className="section-heading">
          <span>АВТОМАРШРУТ</span>
        </div>
        <label htmlFor="routeTargetSelect">Конечная цель</label>
        <select id="routeTargetSelect" />
        <div className="route-actions">
          <button id="pickRouteTarget" className="secondary-button">
            Выбрать на карте
          </button>
          <button id="calculateRoute" className="secondary-button">
            Найти путь
          </button>
        </div>
        <div id="routeResult" className="route-result">
          Назначьте старт союза и выберите цель.
        </div>
        <div id="routeAlternatives" className="route-alternatives" hidden />
        <div className="route-legend">
          <span className="preliminary">Предварительная</span>
          <span className="unavailable">Недоступная</span>
        </div>
        <button id="addCalculatedRoute" className="primary-button route-add-button" disabled>
          Добавить как маршрут
        </button>
        <div className="route-recommendations">
          <strong>Рекомендуемые цели</strong>
          <div id="routeRecommendations">Сначала назначьте старт союза.</div>
        </div>
      </div>

      <div className="sidebar-section display-section">
        <div className="section-heading">
          <span>ОТОБРАЖЕНИЕ</span>
        </div>
        <Toggle id="showNames" label="Названия объектов" />
        <Toggle id="showValues" label="Очки за захват" checked={false} />
        <Toggle id="showStrategic" label="Стратегическая информация" checked={false} />
        <Toggle id="showEnemies" label="Территории противников" />
        <Toggle id="showNeutral" label="Нейтральные" />
        <Toggle id="showArrows" label="Стрелки" />
        <Toggle id="showConnections" label="Связи объектов" />
        <Toggle id="showLabels" label="Подписи" />
        <Toggle id="showMarkers" label="Маркеры союзов" />
        <Toggle id="showLegend" label="Легенда при экспорте" />
      </div>

      <div className="sidebar-section project-section">
        <div className="section-heading">
          <span>ПРОЕКТ</span>
        </div>
        <label htmlFor="mobileMapSelect">Карта события</label>
        <select id="mobileMapSelect" className="mobile-map-select" aria-label="Карта события на мобильном" />
        <select id="mobilePlanSelect" className="mobile-plan-select" aria-label="Текущий план на мобильном" />
        <button id="newPlan" className="secondary-button">
          Новый пустой
        </button>
        <button id="clonePlanMobile" className="secondary-button">
          Копировать день
        </button>
        <button id="renamePlan" className="secondary-button">
          Переименовать
        </button>
        <button id="deletePlan" className="secondary-button wide-button">
          Удалить текущий день
        </button>
        <button id="exportJson" className="secondary-button">
          Экспорт JSON
        </button>
        <button id="importJson" className="secondary-button">
          Импорт JSON
        </button>
        <button id="copyPng" className="secondary-button wide-button">
          Копировать карту как PNG
        </button>
        <button id="exportPngHigh" className="secondary-button wide-button">
          Экспорт PNG высокого качества
        </button>
        <button id="shareView" className="secondary-button wide-button">
          Ссылка только для просмотра
        </button>
        <button id="collaborationBtnMobile" className="secondary-button wide-button">
          Команда и синхронизация
        </button>
        <button id="helpBtnMobile" className="secondary-button wide-button">
          Помощь
        </button>
        <input id="importFile" type="file" accept="application/json,.json" hidden />
        <button id="resetPlan" className="danger-link">
          Сбросить текущий план
        </button>
      </div>

      <div className="sidebar-tip">
        <span>i</span>
        <p>
          <strong>Быстрый план</strong>Выберите инструмент сверху и нажмите территорию. Инструмент «Выбор» открывает меню точки. Локальный
          план сохраняется в этом браузере; для работы вместе откройте «Команда».
        </p>
      </div>
    </aside>
  );
}
