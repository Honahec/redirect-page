import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { normalizePath } from '@/lib/utils'
import type { ServiceItem } from '@/types/app'

type ServiceEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (service: ServiceItem) => void
  service?: ServiceItem
}

type DraftService = Omit<ServiceItem, 'id'> & {
  id?: string
}

type ServiceEditorContentProps = Pick<
  ServiceEditorDialogProps,
  'onOpenChange' | 'onSave' | 'service'
>

const emptyDraft: DraftService = {
  name: '',
  description: '',
  port: '',
  path: '',
  protocol: 'http',
  category: 'service',
  lanEnabled: false,
}

export function ServiceEditorDialog({
  open,
  onOpenChange,
  onSave,
  service,
}: ServiceEditorDialogProps) {
  const dialogKey = `${service?.id ?? 'new'}-${open ? 'open' : 'closed'}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ServiceEditorContent
          key={dialogKey}
          onOpenChange={onOpenChange}
          onSave={onSave}
          service={service}
        />
      </DialogContent>
    </Dialog>
  )
}

function ServiceEditorContent({
  onOpenChange,
  onSave,
  service,
}: ServiceEditorContentProps) {
  const [draft, setDraft] = useState<DraftService>(service ?? emptyDraft)
  const [error, setError] = useState('')

  const updateField = <K extends keyof DraftService>(key: K, value: DraftService[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleSave = () => {
    if (!draft.name.trim()) {
      setError('Name is required.')
      return
    }

    if (!draft.port.trim()) {
      setError('Port is required.')
      return
    }

    onSave({
      id: draft.id ?? window.crypto.randomUUID(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      port: draft.port.trim(),
      path: normalizePath(draft.path),
      protocol: draft.protocol,
      category: draft.category.trim() || 'service',
      lanEnabled: draft.lanEnabled,
    })
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{service ? 'Edit service' : 'Add service'}</DialogTitle>
        <DialogDescription>
          Configure the service entry shown on the home page.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="service-name">Name</Label>
          <Input
            id="service-name"
            value={draft.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Jellyfin"
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="service-description">Description</Label>
          <Textarea
            id="service-description"
            value={draft.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="service-category">Category</Label>
          <Input
            id="service-category"
            value={draft.category}
            onChange={(event) => updateField('category', event.target.value)}
            placeholder="media / infra / tool"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="service-port">Port</Label>
          <Input
            id="service-port"
            value={draft.port}
            onChange={(event) => updateField('port', event.target.value)}
            inputMode="numeric"
            placeholder="8096"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="service-protocol">Protocol</Label>
          <select
            id="service-protocol"
            className="flex h-11 w-full rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
            value={draft.protocol}
            onChange={(event) =>
              updateField('protocol', event.target.value as ServiceItem['protocol'])
            }
          >
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="service-path">Path</Label>
          <Input
            id="service-path"
            value={draft.path}
            onChange={(event) => updateField('path', event.target.value)}
            placeholder="/admin"
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-stone-900">Enable IPv4</p>
            <p className="text-sm text-stone-600">Show the LAN IPv4 link for this service.</p>
          </div>
          <Switch
            checked={draft.lanEnabled}
            onCheckedChange={(checked) => updateField('lanEnabled', checked)}
          />
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}
