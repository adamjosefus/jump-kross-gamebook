import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import logo from '@/assets/qr-logo.svg'
import { EndQr, ProgressQr, TeamLoginQr } from '@/components/qr/qr-cards'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { adminKeys } from './queries'

/** Every QR code of the game, laid out for printing on A4. */
export const PrintPage = () => {
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
  })

  if (codes.isPending) return <Loader2 className="m-8 size-6 animate-spin" />
  if (codes.isError) return <p className="text-destructive p-8">{errorMessage(codes.error)}</p>

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="flex items-center gap-4 print:hidden">
        <p className="text-muted-foreground text-sm">
          {codes.data.length} kódů. Přihlašovací kód týmu patří jen jemu, kód místa platí pro všechny týmy.
        </p>
        <span className="flex-1" />
        <Button onClick={() => window.print()} disabled={codes.data.length === 0}>
          <Printer /> Tisknout
        </Button>
      </div>
      <div className="flex flex-wrap gap-4 print:gap-[0.5cm]">
        {codes.data.map((entry) =>
          entry.kind === 'T' ? (
            <TeamLoginQr key={entry.code} value={entry.code} teamName={entry.label} logo={logo} />
          ) : entry.kind === 'E' ? (
            <EndQr key={entry.code} value={entry.code} locationName={entry.label} logo={logo} />
          ) : (
            <ProgressQr key={entry.code} value={entry.code} locationName={entry.label} logo={logo} />
          ),
        )}
      </div>
    </div>
  )
}
