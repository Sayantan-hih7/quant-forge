import { App as AntApp } from "antd";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeProvider";
import { AppRouter } from "./router/AppRouter";
import { WorkspaceAccess } from './modules/auth/components/WorkspaceAccess';

export default function App() {
  return (
    <ThemeProvider>
      <AntApp message={{ duration: 5, maxCount: 3 }} notification={{ placement: 'topRight', duration: 8, maxCount: 3 }}>
        <BrowserRouter>
          <WorkspaceAccess><AppRouter /></WorkspaceAccess>
        </BrowserRouter>
      </AntApp>
    </ThemeProvider>
  );
}
