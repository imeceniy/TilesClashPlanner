import { useEffect } from "react";
import { Dialogs } from "./components/Dialogs";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import { startPlanner } from "./planner-runtime";

export function App() {
  useEffect(() => {
    void startPlanner();
  }, []);
  return (
    <>
      <div className="app-shell">
        <Header />
        <Sidebar />
        <Workspace />
      </div>
      <Dialogs />
    </>
  );
}
