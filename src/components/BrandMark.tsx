interface BrandMarkProps {
  compact?: boolean
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className="brand" aria-label="Covil">
      <svg
        className="brand__symbol"
        viewBox="0 0 64 64"
        role="img"
        aria-hidden="true"
      >
        <path d="M10 15c0-2.76 2.24-5 5-5h15v16H15c-2.76 0-5-2.24-5-5v-6Z" />
        <path d="M54 15c0-2.76-2.24-5-5-5H34v16h15c2.76 0 5-2.24 5-5v-6Z" opacity=".72" />
        <path d="M10 49c0 2.76 2.24 5 5 5h15V38H15c-2.76 0-5 2.24-5 5v6Z" opacity=".72" />
        <path d="M54 49c0 2.76-2.24 5-5 5H34V38h15c2.76 0 5 2.24 5 5v6Z" opacity=".42" />
        <circle cx="32" cy="32" r="4.5" className="brand__core" />
      </svg>
      {!compact && <span className="brand__wordmark">COVIL</span>}
    </div>
  )
}
