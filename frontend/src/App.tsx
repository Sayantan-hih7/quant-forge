import { App as AntApp } from "antd";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeProvider";
import { AppRouter } from "./router/AppRouter";
import { WorkspaceAccess } from './modules/auth/components/WorkspaceAccess';

export default function App() {
  return (
    <ThemeProvider>
      <AntApp>
        <BrowserRouter>
          <WorkspaceAccess><AppRouter /></WorkspaceAccess>
        </BrowserRouter>
      </AntApp>
    </ThemeProvider>
  );
}
