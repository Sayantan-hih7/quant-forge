import { theme, type ThemeConfig } from 'antd'
// Extend this registry to add more palettes; features use semantic CSS tokens.
export const themePresets: Record<'light' | 'dark', ThemeConfig> = {
  light: { algorithm: theme.defaultAlgorithm, token: { colorPrimary: '#4268dc', colorBgLayout: '#f2f4f8', colorBgContainer: '#ffffff', colorText: '#202939', colorBorder: '#dce2eb' } },
  dark: { algorithm: theme.darkAlgorithm, token: { colorPrimary: '#88a4ff', colorBgLayout: '#101419', colorBgContainer: '#181d25', colorText: '#e1e6ef', colorBorder: '#303743' } },
}
export const sharedTheme: ThemeConfig = {
  token: {
    borderRadius: 6,
    fontFamily: 'var(--font-ui)',
    fontFamilyCode: 'var(--font-data)',
    fontSize: 12,
    fontSizeSM: 11,
    fontSizeLG: 14,
    fontSizeHeading1: 24,
    fontSizeHeading2: 20,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    lineHeight: 1.5,
    fontWeightStrong: 500,
    controlHeight: 34,
  },
  components: { Table: { cellPaddingBlockSM: 12, cellPaddingInlineSM: 12 }, Menu: { itemHeight: 35, itemMarginInline: 0, iconSize: 17 }, Button: { fontWeight: 500 } },
}
