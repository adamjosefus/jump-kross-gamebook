export type Value = string | number | boolean;
export type State = Readonly<Record<string, Value>>;

export type NodeType = 'intro' | 'start' | 'passage' | 'end';
