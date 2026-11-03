# Walkthrough (milestone 9)

A tour of every feature, captured on 2026-11-03 from the dev server and a production preview.
Regenerate with `node scripts/screenshots.mjs m9 …` (the standard flow) and
`node scripts/walkthrough.mjs [devUrl] [previewUrl]` (everything else).

## Rolling

| Step                                                       | Desktop                                                                                                                   | Mobile                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start: empty table, dice bar, saved custom dice            | [m9-desktop-1-initial](screenshots/m9-desktop-1-initial.png)                                                              | [m9-mobile-1-initial](screenshots/m9-mobile-1-initial.png)                                                                                         |
| Tray with 7 standard dice and 2 × Combat                   | [m9-desktop-2-tray](screenshots/m9-desktop-2-tray.png)                                                                    | [m9-mobile-2-tray](screenshots/m9-mobile-2-tray.png)                                                                                               |
| Dice tumbling                                              | [m9-desktop-3-rolling](screenshots/m9-desktop-3-rolling.png)                                                              | [m9-mobile-3-rolling](screenshots/m9-mobile-3-rolling.png)                                                                                         |
| Result tiles, total, history entry                         | [m9-desktop-4-result](screenshots/m9-desktop-4-result.png)                                                                | [m9-mobile-4-result](screenshots/m9-mobile-4-result.png)                                                                                           |
| Phone without scrolling: table, tray, Roll in thumb reach  |                                                                                                                           | [walk-mobile-viewport-tray](screenshots/walk-mobile-viewport-tray.png), [walk-mobile-viewport-result](screenshots/walk-mobile-viewport-result.png) |
| Full tray (20 dice): add buttons unavailable, notice shown | [walk-desktop-tray-full](screenshots/walk-desktop-tray-full.png), [result](screenshots/walk-desktop-tray-full-result.png) |                                                                                                                                                    |
| Natural 20 (green glow) and natural 1 (red glow)           | [walk-desktop-nat20](screenshots/walk-desktop-nat20.png), [walk-desktop-nat1](screenshots/walk-desktop-nat1.png)          |                                                                                                                                                    |
| History at its 20-roll limit, crits coloured               | [walk-desktop-history](screenshots/walk-desktop-history.png)                                                              |                                                                                                                                                    |

## Custom dice

| Step                                          | Desktop                                                                    | Mobile                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Manager: list of saved dice                   | [m9-desktop-5-manager](screenshots/m9-desktop-5-manager.png)               | [m9-mobile-5-manager](screenshots/m9-mobile-5-manager.png) |
| Editor: name, face count, one field per face  | [m9-desktop-6-editor](screenshots/m9-desktop-6-editor.png)                 | [m9-mobile-6-editor](screenshots/m9-mobile-6-editor.png)   |
| Validation: duplicate name, no labelled faces | [walk-desktop-editor-errors](screenshots/walk-desktop-editor-errors.png)   |                                                            |
| Delete asks for confirmation inline           | [walk-desktop-delete-confirm](screenshots/walk-desktop-delete-confirm.png) |                                                            |

## Accessibility and offline

| Step                                                                     | Screenshot                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Visible focus ring while using the keyboard (d20 added twice with Enter) | [walk-desktop-keyboard-focus](screenshots/walk-desktop-keyboard-focus.png) |
| Production build reloaded with the network off, then rolled              | [walk-mobile-offline](screenshots/walk-mobile-offline.png)                 |

## Found during the review

- **Fixed: a long history pushed the controls away from the table (desktop).** The table and the
  history shared a stretchy grid row, so 20 history entries left a ~650 px gap between the table
  and the dice buttons. The extra height now goes to an empty last row. Covered by the e2e test
  "keeps the controls under the table when the history is long".
- **Fixed: the tab-order e2e test failed in Firefox** because Firefox keeps the last control
  focused when Tab leaves the page. The app itself was fine.
- **Browsers:** all e2e tests pass in Chromium (desktop + Pixel 7) and Firefox
  (`npm run test:firefox`), run locally. Safari/WebKit is not tested
  (decided in milestone 9: Chromium and Firefox are enough).
- **For the visual-style pass:** pale emoji such as 🌫️ have low contrast on the white dice and
  tiles; the desktop side column is empty before the first roll; a long tray summary is cut off
  with "…" (the chips below show every die).
