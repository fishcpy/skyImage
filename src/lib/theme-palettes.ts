export const themePalettes = [
  {
    value: "skyimage",
    labelKey: "theme.palette.skyimage",
    descriptionKey: "theme.palette.skyimage.description",
    swatches: ["0 0% 9%", "0 0% 96.1%", "0 0% 45.1%"]
  },
  {
    value: "shadcn-admin",
    labelKey: "theme.palette.shadcnAdmin",
    descriptionKey: "theme.palette.shadcnAdmin.description",
    swatches: ["221 83% 53%", "214 95% 93%", "221 39% 46%"]
  },
  {
    value: "zinc",
    labelKey: "theme.palette.zinc",
    descriptionKey: "theme.palette.zinc.description",
    swatches: ["240 5.9% 10%", "240 4.8% 95.9%", "240 3.8% 46.1%"]
  },
  {
    value: "slate",
    labelKey: "theme.palette.slate",
    descriptionKey: "theme.palette.slate.description",
    swatches: ["222.2 47.4% 11.2%", "210 40% 96.1%", "215.4 16.3% 46.9%"]
  },
  {
    value: "stone",
    labelKey: "theme.palette.stone",
    descriptionKey: "theme.palette.stone.description",
    swatches: ["24 9.8% 10%", "60 4.8% 95.9%", "25 5.3% 44.7%"]
  }
] as const;

export type ThemePalette = (typeof themePalettes)[number]["value"];

export const defaultThemePalette: ThemePalette = "skyimage";

export function isThemePalette(value: string | null | undefined): value is ThemePalette {
  return themePalettes.some((palette) => palette.value === value);
}