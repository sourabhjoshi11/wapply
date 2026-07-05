declare module 'lucide-react' {
  import { FC, SVGProps, ForwardRefExoticComponent, RefAttributes } from 'react';

  export interface IconProps extends Partial<SVGProps<SVGSVGElement>> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  export type LucideIcon = ForwardRefExoticComponent<
    IconProps & RefAttributes<SVGSVGElement>
  >;

  export const ArrowUpCircle: LucideIcon;
  export const ArrowDownCircle: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const BookOpen: LucideIcon;
  export const Calendar: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Download: LucideIcon;
  export const Globe: LucideIcon;
  export const IndianRupee: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const LogOut: LucideIcon;
  export const Menu: LucideIcon;
  export const MessageCircle: LucideIcon;
  export const Package: LucideIcon;
  export const PauseCircle: LucideIcon;
  export const Pencil: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const Save: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Share2: LucideIcon;
  export const ShoppingCart: LucideIcon;
  export const Trash2: LucideIcon;
  export const Upload: LucideIcon;
  export const Users: LucideIcon;
  export const Wallet: LucideIcon;
  export const CreditCard: LucideIcon;
  export const Zap: LucideIcon;
  export const History: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const X: LucideIcon;
}
