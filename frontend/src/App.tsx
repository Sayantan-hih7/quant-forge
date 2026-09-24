import { App as AntApp } from "antd";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeProvider";
import { AppRouter } from "./router/AppRouter";

export default function App() {
  return (
    <ThemeProvider>
      <AntApp>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntApp>
    </ThemeProvider>
  );
}
