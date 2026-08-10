(function (global) {
  "use strict";

  global.PeakThemeSystem = Object.freeze({
    version: 2,
    stateKey: "peak-ui-system-theme-v2",
    channel: "peak-ui-system-theme-v2",
    defaults: Object.freeze({
      pack: "violet",
      appearance: "light",
      density: "comfortable",
      radius: "balanced",
      typography: "default",
      elevation: "subtle",
      motion: "standard",
      accent: "#6652d9"
    }),
    axes: Object.freeze({
      pack: ["violet", "ink", "moss", "ocean"],
      appearance: ["light", "dark"],
      density: ["compact", "comfortable"],
      radius: ["square", "balanced", "soft"],
      typography: ["compact", "default", "large"],
      elevation: ["flat", "subtle", "layered"],
      motion: ["reduced", "standard"]
    }),
    packs: Object.freeze({
      violet: Object.freeze({
        label: "Peak Violet",
        accent: "#6652d9",
        light: Object.freeze({
          canvas: "#f4f5f7", background: "#ffffff", surface: "#ffffff",
          raised: "#fafafa", sunken: "#f1f2f5", text: "#252930",
          muted: "#69727d", faint: "#9aa1aa", border: "#dfe3e8", strong: "#cbd1d8"
        }),
        dark: Object.freeze({
          canvas: "#15151d", background: "#1c1c27", surface: "#20202c",
          raised: "#272735", sunken: "#171720", text: "#ececf5",
          muted: "#b0afc2", faint: "#77768a", border: "#383747", strong: "#4d4b61"
        })
      }),
      ink: Object.freeze({
        label: "Quiet Ink",
        accent: "#315efb",
        light: Object.freeze({
          canvas: "#f6f7f8", background: "#ffffff", surface: "#ffffff",
          raised: "#fbfbfc", sunken: "#eef0f3", text: "#1e2329",
          muted: "#616a75", faint: "#969da6", border: "#dce0e5", strong: "#c5cbd3"
        }),
        dark: Object.freeze({
          canvas: "#111418", background: "#171b20", surface: "#1d2229",
          raised: "#242a32", sunken: "#12161b", text: "#edf1f5",
          muted: "#abb3bd", faint: "#747e89", border: "#333a43", strong: "#48515c"
        })
      }),
      moss: Object.freeze({
        label: "Calm Moss",
        accent: "#2f7d5a",
        light: Object.freeze({
          canvas: "#f3f6f3", background: "#fcfdfc", surface: "#ffffff",
          raised: "#f7faf7", sunken: "#edf2ee", text: "#25302a",
          muted: "#64726a", faint: "#96a199", border: "#d9e1db", strong: "#c2cdc5"
        }),
        dark: Object.freeze({
          canvas: "#121815", background: "#18201c", surface: "#1d2722",
          raised: "#243029", sunken: "#131a16", text: "#eaf2ed",
          muted: "#aabbb0", faint: "#718077", border: "#344239", strong: "#48594e"
        })
      }),
      ocean: Object.freeze({
        label: "Clear Ocean",
        accent: "#1f6feb",
        light: Object.freeze({
          canvas: "#f2f6fa", background: "#fbfdff", surface: "#ffffff",
          raised: "#f7faff", sunken: "#eaf1f8", text: "#202a35",
          muted: "#637080", faint: "#95a0ad", border: "#d8e1eb", strong: "#c1cedb"
        }),
        dark: Object.freeze({
          canvas: "#10171f", background: "#161f29", surface: "#1b2632",
          raised: "#22303e", sunken: "#111922", text: "#eaf1f8",
          muted: "#a8b6c5", faint: "#708092", border: "#304152", strong: "#43586b"
        })
      })
    })
  });
}(window));
