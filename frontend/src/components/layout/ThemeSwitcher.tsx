import { Segmented, Tooltip } from "antd";
import { SunOutlined, MoonOutlined, DesktopOutlined } from "@ant-design/icons";
import { useUiStore, type ThemeMode } from "../../store/uiStore";
export function ThemeSwitcher() {
  const mode = useUiStore((s) => s.themeMode);
  const setMode = useUiStore((s) => s.setThemeMode);
  return (
    <Segmented
      aria-label="Color theme"
      size="middle"
      styles={{ label: { display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 } }}
      value={mode}
      onChange={(value) => setMode(value as ThemeMode)}
      options={[
        {
          value: "light",
          label: (
            <Tooltip title="Light theme">
              <span aria-label="Light theme">
                <SunOutlined />
              </span>
            </Tooltip>
          ),
        },
        {
          value: "dark",
          label: (
            <Tooltip title="Dark theme">
              <span aria-label="Dark theme">
                <MoonOutlined />
              </span>
            </Tooltip>
          ),
        },
        {
          value: "system",
          label: (
            <Tooltip title="System theme">
              <span aria-label="System theme">
                <DesktopOutlined />
              </span>
            </Tooltip>
          ),
        },
      ]}
    />
  );
}
