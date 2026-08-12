(function (global) {
  "use strict";

  global.PeakThemeSystem = Object.freeze({
    version: 4,
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
    composerDefaults: Object.freeze({
      preset: "peak-default",
      overrides: Object.freeze({})
    }),
    graphDefaults: Object.freeze({
      nodeShape: "round-rectangle",
      nodeScale: 1,
      labelSizePx: 14,
      edgeWidthPx: 2,
      layoutSpacing: 120,
      canvasPattern: "grid"
    }),
    graphOptions: Object.freeze({
      nodeShape: ["round-rectangle", "rectangle", "ellipse"],
      canvasPattern: ["grid", "plain"]
    }),
    graphRanges: Object.freeze({
      nodeScale: [0.75, 1.5],
      labelSizePx: [11, 18],
      edgeWidthPx: [1, 5],
      layoutSpacing: [80, 220]
    }),
    composerOverrideOptions: Object.freeze({
      fontPair: ["interface", "reading-serif", "hybrid"],
      headingEmphasis: ["quiet", "clear", "strong"],
      quoteStyle: ["rail", "tint", "plain"],
      calloutStyle: ["outlined", "tinted", "quiet"],
      codeSurface: ["flat", "outlined", "raised"],
      tableDensity: ["compact", "comfortable"],
      mediaFrame: ["flush", "framed", "soft"],
      mathScale: ["compact", "default", "large"]
    }),
    composerOverrideRanges: Object.freeze({
      bodySizePx: [14, 18],
      contentMeasurePx: [620, 920],
      bodyLineHeight: [1.5, 2],
      paragraphGapPx: [6, 24],
      listIndentPx: [16, 32],
      listGapPx: [0, 10]
    }),
    composerPresets: Object.freeze({
      "peak-default": Object.freeze({
        label: "Peak Default",
        description: "一般知识编辑",
        values: Object.freeze({
          fontPair: "interface", bodySizePx: 15, contentMeasurePx: 760,
          bodyLineHeight: 1.78, paragraphGapPx: 12, headingEmphasis: "clear",
          listIndentPx: 22, listGapPx: 3, quoteStyle: "rail",
          calloutStyle: "outlined", codeSurface: "outlined",
          tableDensity: "comfortable", mediaFrame: "framed", mathScale: "default"
        })
      }),
      "research-compact": Object.freeze({
        label: "Research Compact",
        description: "资料密集与长列表",
        values: Object.freeze({
          fontPair: "interface", bodySizePx: 14, contentMeasurePx: 840,
          bodyLineHeight: 1.62, paragraphGapPx: 8, headingEmphasis: "quiet",
          listIndentPx: 18, listGapPx: 1, quoteStyle: "plain",
          calloutStyle: "quiet", codeSurface: "flat",
          tableDensity: "compact", mediaFrame: "flush", mathScale: "compact"
        })
      }),
      longform: Object.freeze({
        label: "Longform",
        description: "长文阅读与写作",
        values: Object.freeze({
          fontPair: "reading-serif", bodySizePx: 16, contentMeasurePx: 690,
          bodyLineHeight: 1.92, paragraphGapPx: 18, headingEmphasis: "clear",
          listIndentPx: 24, listGapPx: 5, quoteStyle: "tint",
          calloutStyle: "quiet", codeSurface: "outlined",
          tableDensity: "comfortable", mediaFrame: "soft", mathScale: "large"
        })
      }),
      editorial: Object.freeze({
        label: "Editorial",
        description: "对外文章与视觉叙事",
        values: Object.freeze({
          fontPair: "hybrid", bodySizePx: 16, contentMeasurePx: 780,
          bodyLineHeight: 1.82, paragraphGapPx: 16, headingEmphasis: "strong",
          listIndentPx: 24, listGapPx: 4, quoteStyle: "tint",
          calloutStyle: "tinted", codeSurface: "raised",
          tableDensity: "comfortable", mediaFrame: "soft", mathScale: "default"
        })
      })
    }),
    packs: Object.freeze({
      violet: Object.freeze({
        label: "Peak Violet",
        accent: "#6652d9",
        light: Object.freeze({
          canvas: "#f4f5f7", background: "#ffffff", surface: "#ffffff",
          raised: "#fafafa", sunken: "#f1f2f5", text: "#252930",
          muted: "#69727d", faint: "#6f7782", border: "#dfe3e8", strong: "#cbd1d8"
        }),
        dark: Object.freeze({
          canvas: "#15151d", background: "#1c1c27", surface: "#20202c",
          raised: "#272735", sunken: "#171720", text: "#ececf5",
          muted: "#b0afc2", faint: "#9c9bad", border: "#383747", strong: "#4d4b61"
        })
      }),
      ink: Object.freeze({
        label: "Quiet Ink",
        accent: "#315efb",
        light: Object.freeze({
          canvas: "#f6f7f8", background: "#ffffff", surface: "#ffffff",
          raised: "#fbfbfc", sunken: "#eef0f3", text: "#1e2329",
          muted: "#616a75", faint: "#6c7580", border: "#dce0e5", strong: "#c5cbd3"
        }),
        dark: Object.freeze({
          canvas: "#111418", background: "#171b20", surface: "#1d2229",
          raised: "#242a32", sunken: "#12161b", text: "#edf1f5",
          muted: "#abb3bd", faint: "#98a3af", border: "#333a43", strong: "#48515c"
        })
      }),
      moss: Object.freeze({
        label: "Calm Moss",
        accent: "#2f7d5a",
        light: Object.freeze({
          canvas: "#f3f6f3", background: "#fcfdfc", surface: "#ffffff",
          raised: "#f7faf7", sunken: "#edf2ee", text: "#25302a",
          muted: "#64726a", faint: "#6b776f", border: "#d9e1db", strong: "#c2cdc5"
        }),
        dark: Object.freeze({
          canvas: "#121815", background: "#18201c", surface: "#1d2722",
          raised: "#243029", sunken: "#131a16", text: "#eaf2ed",
          muted: "#aabbb0", faint: "#98a99e", border: "#344239", strong: "#48594e"
        })
      }),
      ocean: Object.freeze({
        label: "Clear Ocean",
        accent: "#1f6feb",
        light: Object.freeze({
          canvas: "#f2f6fa", background: "#fbfdff", surface: "#ffffff",
          raised: "#f7faff", sunken: "#eaf1f8", text: "#202a35",
          muted: "#637080", faint: "#687583", border: "#d8e1eb", strong: "#c1cedb"
        }),
        dark: Object.freeze({
          canvas: "#10171f", background: "#161f29", surface: "#1b2632",
          raised: "#22303e", sunken: "#111922", text: "#eaf1f8",
          muted: "#a8b6c5", faint: "#96a7b9", border: "#304152", strong: "#43586b"
        })
      })
    })
  });
}(window));
