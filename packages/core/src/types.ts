export type Value = string | number | boolean;
export type State = Readonly<Record<string, Value>>;

export type NodeType = 'start' | 'passage' | 'end';
