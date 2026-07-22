import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // 基础：扁平安静（对齐 Cursor / macOS：按下只换色不形变、无立体阴影），保留原 svg 尺寸约定
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        // default：唯一的实心按钮，纯色平涂，hover/active 仅调不透明度
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        // outline：hairline 描边 + 透明底，hover 时浮出浅墨水填充
        outline:
          "border border-foreground/10 bg-transparent text-foreground hover:bg-foreground/[0.05] hover:border-foreground/15",
        // secondary：浅墨水填充，hover 加深一档
        secondary:
          "bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.08] active:bg-foreground/10",
        // ghost：无底，hover 仅浮出浅墨水
        ghost: "hover:bg-foreground/[0.06] hover:text-foreground",
        // link：纯文字按钮
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9 focus-visible:ring-0",
        "icon-sm": "h-7 w-7 rounded-sm focus-visible:ring-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
