import { getInitials } from '../lib/formatters'

interface AvatarProps {
  name: string
  color: string
  imageUrl?: string
  size?: 'small' | 'medium' | 'large'
  status?: 'online' | 'away' | 'offline'
  speaking?: boolean
}

export function Avatar({
  name,
  color,
  imageUrl,
  size = 'medium',
  status,
  speaking = false,
}: AvatarProps) {
  const palette = getPaletteClass(color)

  return (
    <span
      className={`avatar avatar--${size} ${palette}${speaking ? ' avatar--speaking' : ''}`}
      title={name}
    >
      {imageUrl ? <img alt="" src={imageUrl} /> : <span>{getInitials(name)}</span>}
      {status && <i className={`avatar__status avatar__status--${status}`} />}
    </span>
  )
}

function getPaletteClass(color: string) {
  const palettes: Record<string, string> = {
    '#ff7043': 'avatar--coral',
    '#7a8cff': 'avatar--indigo',
    '#55c98a': 'avatar--green',
    '#d58cff': 'avatar--violet',
    '#e8b35d': 'avatar--amber',
    '#626b78': 'avatar--slate',
  }

  return palettes[color.toLowerCase()] ?? 'avatar--slate'
}
