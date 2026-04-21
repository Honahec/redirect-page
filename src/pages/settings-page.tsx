import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ServiceEditorDialog } from '@/components/service-editor-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  buildServiceUrl,
  changeAdminPassword,
  clearCachedSessionPassword,
  fetchAdminState,
  fetchPublicConfig,
  getDefaultPublicConfig,
  getCachedSessionPassword,
  initializeAdminPassword,
  restoreFromEncryptedBackup,
  saveAdminConfig,
  unlockAdmin,
} from '@/lib/storage';
import type { PublicAppConfig, ServiceItem } from '@/types/app';

function SettingsPage() {
  const [config, setConfig] = useState<PublicAppConfig>(() =>
    getDefaultPublicConfig(),
  );
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem>();
  const [passwordChange, setPasswordChange] = useState({
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      try {
        const [state, publicConfig] = await Promise.all([
          fetchAdminState(),
          fetchPublicConfig(),
        ]);

        if (!isActive) {
          return;
        }

        setIsInitialized(state.initialized);
        setConfig(publicConfig);

        const cachedPassword = getCachedSessionPassword();
        if (!cachedPassword || !state.initialized) {
          return;
        }

        const verified = await unlockAdmin(cachedPassword);
        if (!verified || !isActive) {
          return;
        }

        setIsUnlocked(true);
        setConfig(await fetchPublicConfig());
      } catch {
        if (isActive) {
          setStatusMessage('Failed to load server data.');
        }
      }
    };

    void bootstrap();

    return () => {
      isActive = false;
    };
  }, []);

  const updateConfig = <K extends keyof PublicAppConfig>(
    key: K,
    value: PublicAppConfig[K],
  ) => {
    setConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleInitialize = async () => {
    if (!setupPassword || setupPassword.length < 6) {
      setPasswordStatus('Use at least 6 characters for the admin password.');
      return;
    }

    if (setupPassword !== setupPasswordConfirm) {
      setPasswordStatus('Passwords do not match.');
      return;
    }

    await initializeAdminPassword(setupPassword, config);
    setIsInitialized(true);
    setIsUnlocked(true);
    setConfig(await fetchPublicConfig());
    setUnlockPassword('');
    setPasswordStatus('Admin password is enabled.');
  };

  const handleUnlock = async () => {
    const verified = await unlockAdmin(unlockPassword);
    if (!verified) {
      setPasswordStatus('Wrong password.');
      return;
    }

    setConfig(await fetchPublicConfig());
    setIsUnlocked(true);
    setPasswordStatus('');
  };

  const handleSave = async () => {
    try {
      const savedConfig = await saveAdminConfig(config);
      setConfig(savedConfig);
      setStatusMessage('Saved.');
    } catch {
      setStatusMessage('Save failed. Unlock the page again and retry.');
    }
  };

  const handleRestore = async () => {
    try {
      const restored = await restoreFromEncryptedBackup();
      setConfig(restored);
      setStatusMessage('Restored from encrypted backup.');
    } catch {
      setStatusMessage('Backup is not available or the page is locked.');
    }
  };

  const handleServiceSave = (service: ServiceItem) => {
    setConfig((current) => {
      const nextServices = current.services.some(
        (item) => item.id === service.id,
      )
        ? current.services.map((item) =>
            item.id === service.id ? service : item,
          )
        : [...current.services, service];

      return {
        ...current,
        services: nextServices,
      };
    });
    setEditingService(undefined);
  };

  const handleDeleteService = (serviceId: string) => {
    const target = config.services.find((service) => service.id === serviceId);
    if (!target) {
      return;
    }

    if (!window.confirm(`Delete "${target.name}"?`)) {
      return;
    }

    setConfig((current) => ({
      ...current,
      services: current.services.filter((service) => service.id !== serviceId),
    }));
  };

  const handleChangePassword = async () => {
    if (passwordChange.nextPassword.length < 6) {
      setStatusMessage('Use at least 6 characters for the new password.');
      return;
    }

    if (passwordChange.nextPassword !== passwordChange.confirmPassword) {
      setStatusMessage('New passwords do not match.');
      return;
    }

    try {
      await changeAdminPassword(
        passwordChange.currentPassword,
        passwordChange.nextPassword,
      );
      setPasswordChange({
        currentPassword: '',
        nextPassword: '',
        confirmPassword: '',
      });
      setStatusMessage('Password updated.');
    } catch {
      setStatusMessage('Current password is incorrect.');
    }
  };

  const handleLock = () => {
    clearCachedSessionPassword();
    setUnlockPassword('');
    setIsUnlocked(false);
    setStatusMessage('Locked.');
  };

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10'>
      <div className='flex items-center justify-between gap-4 border-stone-200 pb-6'>
        <h1 className='text-3xl font-semibold text-stone-900'>Settings</h1>
        <div className='flex gap-3'>
          <Button asChild variant='outline'>
            <Link to='/'>Back</Link>
          </Button>
          {isUnlocked ? (
            <Button variant='outline' onClick={handleLock}>
              Lock
            </Button>
          ) : null}
        </div>
      </div>

      {!isInitialized ? (
        <Card className='mt-8 rounded-xl border border-stone-200 bg-white shadow-none'>
          <CardHeader>
            <CardTitle>Initialize password</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:max-w-xl'>
            <div className='grid gap-2'>
              <Label htmlFor='setup-password'>Password</Label>
              <Input
                id='setup-password'
                type='password'
                value={setupPassword}
                onChange={(event) => setSetupPassword(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='setup-password-confirm'>Confirm password</Label>
              <Input
                id='setup-password-confirm'
                type='password'
                value={setupPasswordConfirm}
                onChange={(event) =>
                  setSetupPasswordConfirm(event.target.value)
                }
              />
            </div>
            <Button className='w-fit' onClick={handleInitialize}>
              Enable password
            </Button>
            {passwordStatus ? (
              <p className='text-sm text-stone-600'>{passwordStatus}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isInitialized && !isUnlocked ? (
        <Card className='mt-8 rounded-xl border border-stone-200 bg-white shadow-none'>
          <CardHeader>
            <CardTitle>Unlock</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:max-w-xl'>
            <div className='grid gap-2'>
              <Label htmlFor='unlock-password'>Password</Label>
              <Input
                id='unlock-password'
                type='password'
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
              />
            </div>
            <Button className='w-fit' onClick={handleUnlock}>
              Unlock
            </Button>
            {passwordStatus ? (
              <p className='text-sm text-rose-600'>{passwordStatus}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isUnlocked ? (
        <>
          <section className='mt-8 grid gap-6 lg:grid-cols-2'>
            <Card className='rounded-xl border border-stone-200 bg-white shadow-none'>
              <CardHeader>
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <div className='grid gap-2'>
                  <Label htmlFor='site-title'>Title</Label>
                  <Input
                    id='site-title'
                    value={config.siteTitle}
                    onChange={(event) =>
                      updateConfig('siteTitle', event.target.value)
                    }
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='site-description'>Description</Label>
                  <Textarea
                    id='site-description'
                    value={config.siteDescription}
                    onChange={(event) =>
                      updateConfig('siteDescription', event.target.value)
                    }
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='site-lan-ipv4'>LAN IPv4</Label>
                  <Input
                    id='site-lan-ipv4'
                    value={config.lanIpv4}
                    onChange={(event) =>
                      updateConfig('lanIpv4', event.target.value)
                    }
                    placeholder='192.168.1.10'
                  />
                </div>
              </CardContent>
            </Card>

            <Card className='rounded-xl border border-stone-200 bg-white shadow-none'>
              <CardHeader>
                <CardTitle>Security</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <Button
                  className='w-fit'
                  variant='outline'
                  onClick={handleRestore}
                >
                  Restore backup
                </Button>
                <div className='grid gap-2'>
                  <Label htmlFor='current-password'>Current password</Label>
                  <Input
                    id='current-password'
                    type='password'
                    value={passwordChange.currentPassword}
                    onChange={(event) =>
                      setPasswordChange((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='next-password'>New password</Label>
                  <Input
                    id='next-password'
                    type='password'
                    value={passwordChange.nextPassword}
                    onChange={(event) =>
                      setPasswordChange((current) => ({
                        ...current,
                        nextPassword: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='confirm-password'>Confirm new password</Label>
                  <Input
                    id='confirm-password'
                    type='password'
                    value={passwordChange.confirmPassword}
                    onChange={(event) =>
                      setPasswordChange((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  className='w-fit'
                  variant='outline'
                  onClick={handleChangePassword}
                >
                  Change password
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card className='mt-8 rounded-xl border border-stone-200 bg-white shadow-none'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle>Services</CardTitle>
              <Button
                onClick={() => {
                  setEditingService(undefined);
                  setIsEditorOpen(true);
                }}
              >
                Add service
              </Button>
            </CardHeader>
            <CardContent className='overflow-x-auto'>
              <table className='w-full min-w-[760px] border-collapse text-left'>
                <thead>
                  <tr className='border-b border-stone-200'>
                    <th className='px-3 py-3 text-sm font-medium text-stone-700'>
                      Name
                    </th>
                    <th className='px-3 py-3 text-sm font-medium text-stone-700'>
                      Port
                    </th>
                    <th className='px-3 py-3 text-sm font-medium text-stone-700'>
                      Localhost
                    </th>
                    <th className='px-3 py-3 text-sm font-medium text-stone-700'>
                      IPv4
                    </th>
                    <th className='px-3 py-3 text-sm font-medium text-stone-700'>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {config.services.length > 0 ? (
                    config.services.map((service) => {
                      const localhostUrl = buildServiceUrl(
                        service,
                        'localhost',
                      );
                      const lanUrl =
                        config.lanIpv4 && service.lanEnabled
                          ? buildServiceUrl(service, config.lanIpv4)
                          : '-';

                      return (
                        <tr
                          key={service.id}
                          className='border-b border-stone-100 align-top'
                        >
                          <td className='px-3 py-4 text-sm text-stone-900'>
                            {service.name}
                          </td>
                          <td className='px-3 py-4 font-mono text-sm text-stone-700'>
                            {service.port}
                          </td>
                          <td className='px-3 py-4 font-mono text-sm text-stone-700'>
                            {localhostUrl}
                          </td>
                          <td className='px-3 py-4 font-mono text-sm text-stone-700'>
                            {lanUrl}
                          </td>
                          <td className='px-3 py-4'>
                            <div className='flex gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                  setEditingService(service);
                                  setIsEditorOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => handleDeleteService(service.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        className='px-3 py-8 text-sm text-stone-500'
                        colSpan={5}
                      >
                        No services configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className='mt-6 flex items-center justify-between gap-4'>
            <p className='text-sm text-stone-600'>
              {statusMessage || 'Ready.'}
            </p>
            <Button onClick={handleSave}>Save</Button>
          </div>

          <ServiceEditorDialog
            open={isEditorOpen}
            onOpenChange={setIsEditorOpen}
            service={editingService}
            onSave={handleServiceSave}
          />
        </>
      ) : null}
    </main>
  );
}

export default SettingsPage;
