import { useMemo, useState, type FormEvent } from 'react'
import { Check, Pencil, Radio, ShieldCheck, Trash2, UserMinus, UsersRound, Wrench, X } from 'lucide-react'
import {
  covilPermissions,
  type CovilPermission,
  type CovilRole,
  type MemberRoleAssignment,
  type Profile,
} from '../types/domain'
import { Avatar } from './Avatar'
import { Dialog } from './Dialog'

interface CovilSettingsDialogProps {
  assignments: readonly MemberRoleAssignment[]
  canRemoveMembers: boolean
  currentUser: Profile
  isSubmitting: boolean
  members: readonly Profile[]
  roles: readonly CovilRole[]
  onClose: () => void
  onCreateRole: (name: string, color: string, permissions: CovilPermission[]) => Promise<unknown>
  onDeleteRole: (roleId: string) => Promise<unknown>
  onRemoveMember: (userId: string) => Promise<unknown>
  onSetMemberRole: (userId: string, roleId: string, assigned: boolean) => Promise<unknown>
  onUpdateRole: (roleId: string, name: string, color: string, permissions: CovilPermission[]) => Promise<unknown>
}

const permissionCopy: Record<CovilPermission, { label: string; description: string }> = {
  manage_channels: {
    label: 'Criar canais',
    description: 'Criar novos canais de texto e salas de voz.',
  },
  moderate_voice: {
    label: 'Moderar chamadas',
    description: 'Silenciar e desconectar outros membros da voz.',
  },
  remove_members: {
    label: 'Remover membros',
    description: 'Retirar membros comuns do Covil.',
  },
}

const roleColors = ['#ff7043', '#7a8cff', '#55c98a', '#d58cff', '#e8b35d']

export function CovilSettingsDialog(props: CovilSettingsDialogProps) {
  const isOwner = props.currentUser.role === 'owner'
  const [tab, setTab] = useState<'roles' | 'members'>(isOwner ? 'roles' : 'members')

  function handleTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isOwner || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const nextTab = tab === 'roles' ? 'members' : 'roles'
    setTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`covil-tab-${nextTab}`)?.focus())
  }

  return (
    <Dialog
      className="covil-settings"
      eyebrow="CONTROLE DO COVIL"
      onClose={props.onClose}
      title="Cargos e membros"
    >
      <div className="settings-tabs" onKeyDown={handleTabKey} role="tablist" aria-label="Configurações do Covil">
        {isOwner && (
          <button
            aria-selected={tab === 'roles'}
            aria-controls="covil-panel-roles"
            className={tab === 'roles' ? 'is-active' : ''}
            id="covil-tab-roles"
            onClick={() => setTab('roles')}
            role="tab"
            type="button"
          >
            <ShieldCheck size={17} /> Cargos
          </button>
        )}
        <button
          aria-selected={tab === 'members'}
          aria-controls="covil-panel-members"
          className={tab === 'members' ? 'is-active' : ''}
          id="covil-tab-members"
          onClick={() => setTab('members')}
          role="tab"
          type="button"
        >
          <UsersRound size={17} /> Membros
        </button>
      </div>

      <div
        aria-labelledby={`covil-tab-${tab}`}
        className="settings-body"
        id={`covil-panel-${tab}`}
        role="tabpanel"
      >
        {tab === 'roles' && isOwner ? <RolesPane {...props} /> : <MembersPane {...props} />}
      </div>
    </Dialog>
  )
}

function RolesPane({
  roles,
  isSubmitting,
  onCreateRole,
  onDeleteRole,
  onUpdateRole,
}: CovilSettingsDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(roleColors[0])
  const [permissions, setPermissions] = useState<CovilPermission[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(roleColors[0])
  const [editPermissions, setEditPermissions] = useState<CovilPermission[]>([])

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || isSubmitting) return
    setError(null)
    try {
      await onCreateRole(name.trim(), color, permissions)
      setName('')
      setPermissions([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o cargo.')
    }
  }

  async function deleteRole(roleId: string) {
    setError(null)
    try {
      await onDeleteRole(roleId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o cargo.')
    }
  }

  function beginEdit(role: CovilRole) {
    setEditingRoleId(role.id)
    setEditName(role.name)
    setEditColor(role.color)
    setEditPermissions([...role.permissions])
    setError(null)
  }

  async function updateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingRoleId || !editName.trim() || isSubmitting) return
    setError(null)
    try {
      await onUpdateRole(editingRoleId, editName.trim(), editColor, editPermissions)
      setEditingRoleId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível editar o cargo.')
    }
  }

  return (
    <div className="roles-layout">
      <section className="settings-section">
        <header>
          <div><Wrench size={18} /><span><strong>Novo cargo</strong><small>Use como identidade visual e, se quiser, conceda poderes.</small></span></div>
        </header>
        <form className="role-form" onSubmit={createRole}>
          <label className="field-label" htmlFor="role-name">Nome do cargo</label>
          <input
            id="role-name"
            maxLength={30}
            onChange={(event) => setName(event.target.value)}
            placeholder="Guardião da call"
            value={name}
          />
          <fieldset className="color-picker">
            <legend>Cor</legend>
            {roleColors.map((candidate) => (
              <button
                aria-label={`Usar cor ${candidate}`}
                aria-pressed={color === candidate}
                className={color === candidate ? 'is-active' : ''}
                key={candidate}
                onClick={() => setColor(candidate)}
                style={{ '--role-color': candidate } as React.CSSProperties}
                type="button"
              />
            ))}
          </fieldset>
          <fieldset className="permission-list">
            <legend>Permissões opcionais</legend>
            {covilPermissions.map((permission) => {
              const checked = permissions.includes(permission)
              return (
                <label key={permission}>
                  <input
                    checked={checked}
                    onChange={() => setPermissions((current) => (
                      checked
                        ? current.filter((value) => value !== permission)
                        : [...current, permission]
                    ))}
                    type="checkbox"
                  />
                  <span><strong>{permissionCopy[permission].label}</strong><small>{permissionCopy[permission].description}</small></span>
                </label>
              )
            })}
          </fieldset>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <p className="role-form__hint">Sem marcar permissões, o cargo continua visível ao lado do nome.</p>
          <button className="primary-button primary-button--compact" disabled={!name.trim() || isSubmitting} type="submit">
            <ShieldCheck size={17} /> Criar cargo
          </button>
        </form>
      </section>

      <section className="settings-section existing-roles">
        <header><div><ShieldCheck size={18} /><span><strong>Cargos ativos</strong><small>{roles.length}/12 criados</small></span></div></header>
        {roles.length === 0 ? (
          <p className="settings-empty">Nenhum cargo delegado. O fundador mantém todos os controles.</p>
        ) : roles.map((role) => editingRoleId === role.id ? (
          <form className="role-card role-card--editing" key={role.id} onSubmit={updateRole}>
            <input
              aria-label="Editar nome do cargo"
              autoFocus
              maxLength={32}
              onChange={(event) => setEditName(event.target.value)}
              value={editName}
            />
            <fieldset className="color-picker color-picker--compact">
              <legend>Cor</legend>
              {roleColors.map((candidate) => (
                <button
                  aria-label={`Usar cor ${candidate}`}
                  aria-pressed={editColor === candidate}
                  className={editColor === candidate ? 'is-active' : ''}
                  key={candidate}
                  onClick={() => setEditColor(candidate)}
                  style={{ '--role-color': candidate } as React.CSSProperties}
                  type="button"
                />
              ))}
            </fieldset>
            <fieldset className="permission-list permission-list--compact">
              <legend>Poderes</legend>
              {covilPermissions.map((permission) => {
                const checked = editPermissions.includes(permission)
                return (
                  <label key={permission}>
                    <input
                      checked={checked}
                      onChange={() => setEditPermissions((current) => (
                        checked
                          ? current.filter((value) => value !== permission)
                          : [...current, permission]
                      ))}
                      type="checkbox"
                    />
                    <span>{permissionCopy[permission].label}</span>
                  </label>
                )
              })}
            </fieldset>
            <div className="role-card__edit-actions">
              <button aria-label="Salvar cargo" disabled={!editName.trim() || isSubmitting} type="submit"><Check size={15} /></button>
              <button aria-label="Cancelar edição" onClick={() => setEditingRoleId(null)} type="button"><X size={15} /></button>
            </div>
          </form>
        ) : (
          <article className="role-card" key={role.id}>
            <span className="role-swatch" style={{ '--role-color': role.color } as React.CSSProperties} />
            <div>
              <strong>{role.name}</strong>
              <small>{role.permissions.length > 0 ? role.permissions.map((permission) => permissionCopy[permission].label).join(' · ') : 'Cargo visual · sem permissões'}</small>
            </div>
            <button aria-label={`Editar cargo ${role.name}`} disabled={isSubmitting} onClick={() => beginEdit(role)} type="button">
              <Pencil size={15} />
            </button>
            <button aria-label={`Excluir cargo ${role.name}`} disabled={isSubmitting} onClick={() => void deleteRole(role.id)} type="button">
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}

function MembersPane({
  assignments,
  canRemoveMembers,
  currentUser,
  isSubmitting,
  members,
  roles,
  onRemoveMember,
  onSetMemberRole,
}: CovilSettingsDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const assignmentKeys = useMemo(
    () => new Set(assignments.map(({ userId, roleId }) => `${userId}:${roleId}`)),
    [assignments],
  )
  const isOwner = currentUser.role === 'owner'

  async function assign(userId: string, roleId: string, assigned: boolean) {
    setError(null)
    try {
      await onSetMemberRole(userId, roleId, assigned)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o cargo.')
    }
  }

  async function remove(userId: string) {
    setError(null)
    try {
      await onRemoveMember(userId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o membro.')
    }
  }

  return (
    <section className="settings-section members-settings">
      <header><div><UsersRound size={18} /><span><strong>Equipe do Covil</strong><small>Atribua controles sem compartilhar a conta do fundador.</small></span></div></header>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="settings-member-list">
        {members.map((member) => (
          <article className="settings-member" key={member.id}>
            <Avatar color={member.avatarColor} imageUrl={member.avatarUrl} name={member.displayName} size="medium" status={member.status} />
            <div className="settings-member__identity">
              <strong>{member.displayName}</strong>
              <small>{member.role === 'owner' ? 'Fundador · acesso total' : 'Membro do Covil'}</small>
            </div>
            {isOwner && (
              <div className="member-role-chips" aria-label={`Cargos de ${member.displayName}`}>
                {roles.length === 0 ? <small>Crie um cargo primeiro</small> : roles.map((role) => {
                  const assigned = assignmentKeys.has(`${member.id}:${role.id}`)
                  return (
                    <button
                      aria-pressed={assigned}
                      className={assigned ? 'is-assigned' : ''}
                      disabled={isSubmitting}
                      key={role.id}
                      onClick={() => void assign(member.id, role.id, !assigned)}
                      style={{ '--role-color': role.color } as React.CSSProperties}
                      type="button"
                    >
                      <i /> {role.name}
                    </button>
                  )
                })}
              </div>
            )}
            {member.role !== 'owner' && member.id !== currentUser.id && canRemoveMembers && (
              <button
                aria-label={`Remover ${member.displayName} do Covil`}
                className="remove-member-button"
                disabled={isSubmitting}
                onClick={() => void remove(member.id)}
                title="Remover do Covil"
                type="button"
              >
                <UserMinus size={17} />
              </button>
            )}
            {member.role === 'owner' && <span className="owner-lock"><Radio size={14} /> protegido</span>}
          </article>
        ))}
      </div>
    </section>
  )
}
