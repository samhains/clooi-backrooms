# Zellij Rendering Capture (WezTerm)

This note outlines ways to capture Zellij panes when running inside WezTerm so that colors, ligatures, and layout are preserved. Commands assume WezTerm is on your `$PATH`.

## Pane Metadata

- List panes: `wezterm cli list --format json`
- Extract a pane id: `wezterm cli list --format json | jq -r '.[0].pane_id'`

Use these to target the pane running your Zellij session.

## Pixel-Perfect Screenshots

```
wezterm cli screenshot --pane-id <pane-id> --output ~/Pictures/zellij.png
```

- Captures the current framebuffer exactly as rendered (GPU output, with ANSI colors applied).
- Supports `--offset` / `--size` arguments to crop, and `--no-gui` for headless machines.

## Scrollback with ANSI

```
wezterm cli get-text --ansi --pane-id <pane-id> > zellij-ansi.log
```

- Preserves escape sequences for tooling such as `ansi-to-html`, `svg-term-cli`, or custom renderers.
- Pair with your WezTerm color scheme to re-render elsewhere or drive sprite sheets.

## Event Recordings

```
wezterm record --pane-id <pane-id> --output zellij.wezrec
```

- Produces a `.wezrec` zip containing the terminal event stream (Termwiz format).
- Replay later with `wezterm replay zellij.wezrec`, or parse the JSON entries to animate frames in another renderer.

## On-Demand Capture Keybinding

Add to `~/.config/wezterm/wezterm.lua`:

```lua
local wezterm = require 'wezterm'

wezterm.on('capture-active-pane', function(window, pane)
  local stamp = os.date('!%Y%m%d-%H%M%S')
  local file = wezterm.home_dir .. '/Pictures/zellij-' .. stamp .. '.png'
  wezterm.log_info('Saving screenshot to ' .. file)
  wezterm.run_child_process {
    'wezterm',
    'cli',
    'screenshot',
    '--pane-id',
    tostring(pane:pane_id()),
    '--output',
    file,
  }
  window:toast_notification('WezTerm', 'Saved ' .. file, nil, 4000)
end)

return {
  keys = {
    { key = 'P', mods = 'CTRL|SHIFT', action = wezterm.action.EmitEvent 'capture-active-pane' },
  },
}
```

- Press `CTRL+SHIFT+P` to save the current pane to `~/Pictures`.
- Adjust keybinding or output path as needed.

## Workflow Tips

- Combine `wezterm cli get-text` with tools like `charmbracelet/vhs` or `svgt` to generate animated assets while keeping WezTerm’s colors.
- For automation pipelines, wire screenshot or recording commands into project scripts and run them after rendering sessions finish.
- Store captured assets alongside transcripts to keep Zellij state reproducible.
