export function Dialogs() {
  return (
    <>
      <div id="helpModal" className="help-modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle" hidden>
        <div className="help-dialog">
          <header>
            <h2 id="helpTitle">Помощь · Tiles Clash Planner</h2>
            <button id="closeHelp" type="button" aria-label="Закрыть">
              ×
            </button>
          </header>
          <article id="helpContent" className="help-content">
            Загружаем README…
          </article>
        </div>
      </div>
      <div
        id="collaborationModal"
        className="help-modal collaboration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaborationTitle"
        hidden
      >
        <div className="help-dialog collaboration-dialog">
          <header>
            <h2 id="collaborationTitle">Совместная работа</h2>
            <button id="closeCollaboration" type="button" aria-label="Закрыть">
              ×
            </button>
          </header>
          <div id="collaborationContent" className="collaboration-content">
            <section id="authSection">
              <p className="cloud-explanation">
                Чтобы редактировать карту вместе, войдите или зарегистрируйтесь, затем создайте общий проект и добавьте участников.
              </p>
              <div className="collaboration-tabs">
                <button id="loginTab" className="active">
                  Вход
                </button>
                <button id="registerTab">Регистрация</button>
              </div>
              <form id="authForm" className="collaboration-form">
                <label>
                  Логин
                  <input id="authUsername" minLength={3} maxLength={32} required />
                </label>
                <label id="displayNameField" hidden>
                  Имя
                  <input id="authDisplayName" maxLength={60} />
                </label>
                <label>
                  Пароль
                  <input id="authPassword" type="password" minLength={8} required />
                </label>
                <button id="authSubmit" className="primary-button" type="submit">
                  Войти
                </button>
                <small id="authError" className="form-error" />
              </form>
            </section>
            <section id="cloudSection" hidden>
              <p className="cloud-explanation">
                Участники одного общего проекта видят изменения друг друга. R5 управляет участниками, R4 редактирует, MEMBER просматривает.
              </p>
              <div className="cloud-user">
                <div>
                  <strong id="cloudUserName" />
                  <small id="cloudUserLogin" />
                </div>
                <button id="logoutBtn" className="secondary-button">
                  Выйти
                </button>
              </div>
              <div className="cloud-grid">
                <div className="cloud-projects">
                  <div className="section-heading">
                    <span>ОБЩИЕ ПРОЕКТЫ</span>
                    <button id="createCloudProject" className="text-button">
                      ＋ Создать
                    </button>
                  </div>
                  <div id="cloudProjectList" />
                </div>
                <div id="cloudProjectDetails" className="cloud-details">
                  <p className="empty-cloud">Выберите общий проект.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
