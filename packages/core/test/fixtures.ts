/** The format example from the project brief, extended with scan, conditional choice and end. */
export const SAMPLE = `--- A1 --- {
  type: "start"
  theme: "intro"
  initialState: {
    hatColor: "red"
    gold: 100
  }
}

Adipisicing commodo veniam **aliqua** elit nisi aliquip tempor et officia ipsum fugiat.

- Možnost jedna [B1] { hatColor: "blue" }
- Možnost dvě [A2] { hatColor: "green", gold: { delta: -20 } }

--- A2 --- { scan: 32 }

Jděte ke studni na nádvoří.

- Pokračovat [B1]

--- B1 ---

Pohodlně si nosil svojí <if condition='hatColor == "red" && gold >= 34'>červenou čepici<else>chudou pokrývku hlavy</if>.

- Bojovat [C1]
- Koupit meč [C2] { if: 'gold >= 90', gold: { delta: -90 } }

--- C1 --- { type: "end" }

Prohráli jste.

--- C2 --- { type: "end" }

Vyhráli jste.
`
