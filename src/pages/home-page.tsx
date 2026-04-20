import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { buildServiceUrl, usePublicConfig } from '@/lib/storage';

export function HomePage() {
  const config = usePublicConfig();
  const hasLanIpv4 = Boolean(config.lanIpv4.trim());

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10'>
      <div className='flex items-center justify-between gap-4 border-stone-200 pb-6'>
        <h1 className='text-3xl font-semibold text-stone-900'>
          {config.siteTitle}
        </h1>
        <Button asChild variant='outline'>
          <Link to='/settings'>Settings</Link>
        </Button>
      </div>

      <div className='overflow-x-auto pt-8'>
        <table className='w-full min-w-[720px] border-collapse text-left'>
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
            </tr>
          </thead>
          <tbody>
            {config.services.length > 0 ? (
              config.services.map((service) => {
                const localhostUrl = buildServiceUrl(service, 'localhost');
                const lanUrl =
                  hasLanIpv4 && service.lanEnabled
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
                      <a
                        className='underline underline-offset-4 hover:text-stone-900'
                        href={localhostUrl}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {localhostUrl}
                      </a>
                    </td>
                    <td className='px-3 py-4 font-mono text-sm text-stone-700'>
                      {lanUrl === '-' ? (
                        '-'
                      ) : (
                        <a
                          className='underline underline-offset-4 hover:text-stone-900'
                          href={lanUrl}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {lanUrl}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className='px-3 py-8 text-sm text-stone-500' colSpan={4}>
                  No services configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
