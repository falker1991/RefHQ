"use client";
import { useState } from 'react';
import { auth, type Law18Session } from './auth-client';
import catalog from '../docs/documentation-catalog.json';

export function Documentation({ session }: { session: Law18Session }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function download(document: typeof catalog[number]) {
    setBusy(document.id); setMessage('');
    try {
      let current = await auth.ensureValidSession(session);
      const request = () => fetch(`/api/owner-documents/${document.id}`, { headers: { Authorization: `Bearer ${current.access_token}` }, cache: 'no-store' });
      let response = await request();
      if (response.status === 401) { current = await auth.ensureValidSession(current, true); response = await request(); }
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url; link.download = document.source.split('/').pop()!;
      window.document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to download document.'); }
    finally { setBusy(''); }
  }
  return <section className="owner-documentation">
    <div className="section-title"><div><p className="eyebrow">SITE OWNER</p><h1>Documentation</h1><p>Download the latest documents included in this release. Updated files are published with the next site deployment.</p></div></div>
    {message && <p role="alert" className="pilot-message">{message}</p>}
    {[...new Set(catalog.map((item) => item.category))].map((category) => <section className="panel documentation-category" key={category}>
      <h2>{category}</h2>
      {catalog.filter((item) => item.category === category).map((document) => <div className="documentation-row" key={document.id}>
        <strong>{document.title}</strong><button className="secondary" disabled={Boolean(busy)} onClick={() => void download(document)} aria-label={`Download ${document.title} ${document.format}`}>{busy === document.id ? 'Downloading…' : `Download ${document.format}`}</button>
      </div>)}
    </section>)}
  </section>;
}
