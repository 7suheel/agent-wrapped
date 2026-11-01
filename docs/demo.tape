# The README demo GIF, recorded with VHS (https://github.com/charmbracelet/vhs).
#
# Regenerate from the repository root:
#   npm run demo:gif
# which builds the CLI, writes the FAKE "Night Owl" year to .demo-data/ and runs
#   vhs docs/demo.tape
# Needs vhs, ttyd, ffmpeg and the JetBrains Mono font installed.
#
# Privacy: the recording never touches real logs. docs/demo-env.sh (sourced
# while hidden) makes `npx` a shell function that runs this repository's build
# against .demo-data/, the generated fake year.

Output docs/demo.gif

Require node

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 26
Set LineHeight 1.1
Set Width 1200
Set Height 1080
Set Padding 26
Set Margin 22
Set MarginFill "#2e1065"
Set WindowBar Colorful
Set WindowBarSize 44
Set BorderRadius 14
Set Framerate 24
Set TypingSpeed 70ms
Set CursorBlink false
Set Theme { "name": "agent-wrapped", "background": "#0b0a14", "foreground": "#e9e6f5", "cursor": "#f472b6", "selection": "#2a2540", "black": "#1b1828", "red": "#fb7185", "green": "#4ade80", "yellow": "#fbbf24", "blue": "#818cf8", "magenta": "#e879f9", "cyan": "#22d3ee", "white": "#e9e6f5", "brightBlack": "#6b6785", "brightRed": "#fda4af", "brightGreen": "#86efac", "brightYellow": "#fde68a", "brightBlue": "#a5b4fc", "brightMagenta": "#f0abfc", "brightCyan": "#67e8f9", "brightWhite": "#ffffff" }

Hide
Type "source docs/demo-env.sh && clear"
Enter
Sleep 800ms
Show

Sleep 600ms
Type "npx agent-wrapped"
Sleep 500ms
Enter

# The reveal takes about 14 seconds, then hold on the personality.
Sleep 19s
