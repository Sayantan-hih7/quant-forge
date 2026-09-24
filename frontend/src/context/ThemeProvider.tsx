import { useEffect, type PropsWithChildren } from "react";
import { ConfigProvider } from "antd";
import { useUiStore } from "../store/uiStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { sharedTheme, themePresets } from "../config/theme";
export function ThemeProvider({ children }: PropsWithChildren) {
  const mode = useUiStore((s) => s.themeMode);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  return (
    <ConfigProvider
      theme={{
        ...sharedTheme,
        ...themePresets[resolved],
        token: { ...sharedTheme.token, ...themePresets[resolved].token },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
