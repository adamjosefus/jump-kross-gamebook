/** Marks a branch the type checker proves unreachable, e.g. the default of an exhaustive switch. */
export const assertNever = (value: never): never => {
  throw new Error(`Neočekávaná hodnota: ${JSON.stringify(value)}`);
};
