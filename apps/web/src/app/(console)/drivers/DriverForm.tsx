'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createUserAction, verifyDriverAddAction } from '@/lib/actions';
import { Field, Button } from '@/components/ui';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-4">
      {pending ? 'Processing...' : label}
    </Button>
  );
}

export default function DriverForm() {
  const [createState, createAction] = useActionState(createUserAction, null);
  const [verifyState, verifyAction] = useActionState(verifyDriverAddAction, null);

  const [localState, setLocalState] = useState<'INITIAL' | 'OTP'>('INITIAL');

  if (createState?.state === 'OTP_REQUIRED' && localState === 'INITIAL') {
    setLocalState('OTP');
  }

  const BANNER = "relative overflow-hidden rounded-lg px-4 py-3 pl-5 text-sm text-ink ring-1 ring-inset before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']";

  if (localState === 'OTP' && createState?.formData) {
    return (
      <form action={verifyAction} className="space-y-4">
        {createState.success && (
          <p className={`${BANNER} bg-ok-dim/60 ring-ok/30 before:bg-ok mb-4`}>
            {createState.success}
          </p>
        )}
        {verifyState?.error && (
          <p className={`${BANNER} bg-bad-dim/60 ring-bad/30 before:bg-bad mb-4`}>
            {verifyState.error}
          </p>
        )}
        <input type="hidden" name="email" value={createState.formData.email} />
        <input type="hidden" name="role" value={createState.formData.role} />
        <input type="hidden" name="vehicleType" value={createState.formData.vehicleType || ''} />
        
        <Field label="Verification Code (OTP)" name="otp" required placeholder="6-digit code" />
        
        <div className="flex items-center gap-3 mt-4">
          <Submit label="Verify & Add" />
          <Button variant="secondary" onClick={() => setLocalState('INITIAL')} type="button">
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={createAction} className="space-y-4">
        {createState?.error && (
          <p className={`${BANNER} bg-bad-dim/60 ring-bad/30 before:bg-bad mb-4`}>
            {createState.error}
          </p>
        )}
        {createState?.success && !createState.state && (
          <p className={`${BANNER} bg-ok-dim/60 ring-ok/30 before:bg-ok mb-4`}>
            {createState.success}
          </p>
        )}
        <input type="hidden" name="role" value="DELIVERY_AGENT" />
        <Field label="First name" name="firstName" required />
        <Field label="Last name" name="lastName" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Vehicle type" name="vehicleType" placeholder="Motorcycle" />
        
        <Submit label="Create driver" />
    </form>
  );
}
