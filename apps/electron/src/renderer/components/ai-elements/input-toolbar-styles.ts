export const inputToolbarButtonClass =
  'size-[32px] shrink-0 rounded-md text-foreground/60 hover:text-foreground hover:bg-muted/50 data-[state=open]:bg-muted/50 data-[state=open]:text-foreground'

/** 工具栏「开」态：见 globals.css `.input-toolbar-active`（用 --ring，避免 dark 下 primary≈前景） */
export const inputToolbarActiveButtonClass =
  'input-toolbar-active shadow-none [&_svg]:stroke-[2.5]'

export const inputToolbarDangerButtonClass =
  'input-toolbar-stop size-[32px] shrink-0 rounded-md text-destructive hover:!text-[hsl(0,75%,55%)] hover:!bg-[var(--stop-hover-bg)]'

export const inputToolbarSendButtonClass =
  'input-toolbar-send size-[32px] shrink-0 rounded-md text-primary hover:bg-primary/10'

export const inputToolbarDisabledButtonClass =
  'input-toolbar-send-disabled size-[32px] shrink-0 rounded-md text-foreground/30 cursor-not-allowed'
