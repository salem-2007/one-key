declare module '@base-ui/react/separator';
declare module '@base-ui/react/switch';
declare module '@base-ui/react/button';
declare module '@base-ui/react/input';
declare module '@base-ui/react/select';
declare module '@base-ui/react/merge-props';
declare module '@base-ui/react/use-render';

// 扩展模块声明以支持所有导出成员
declare module '@base-ui/react/select' {
  export const Group: any;
  export const Value: any;
  export const Trigger: any;
  export const Popup: any;
  export const Positioner: any;
  export const GroupLabel: any;
  export const Item: any;
  export const Separator: any;
  export const Root: any;
}

declare module '@base-ui/react/separator' {
  export const Props: any;
  export const Root: any;
}

declare module '@base-ui/react/switch' {
  export const Root: any;
  export const Thumb: any;
  export const Input: any;
}

declare module '@base-ui/react/button' {
  export const Props: any;
  export const Root: any;
}
