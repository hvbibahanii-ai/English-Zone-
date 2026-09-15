# Teacher code login setup

Configure these values as Supabase Edge Function secrets. Do not add them to `VITE_*` variables or commit them to the repository.

- `TEACHER_ACCESS_CODE`: set this to the permanent project code `Abdelrahman3177`.
- `TEACHER_AUTH_EMAIL`: the already-provisioned Auth email for Mr Abdelrahman Mohamed.
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key, managed by the Edge Function environment.

Provision the teacher Auth user first, then deploy:

```bash
supabase functions deploy teacher-code-login
supabase secrets set TEACHER_ACCESS_CODE=Abdelrahman3177 TEACHER_AUTH_EMAIL=teacher@example.com
```

Replace the email placeholder with the real teacher email. The access code must remain exactly `Abdelrahman3177`.