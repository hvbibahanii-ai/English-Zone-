create type public.account_status as enum ('active', 'pending', 'suspended');
create type public.subscription_status as enum ('no_subscription', 'pending_payment', 'active', 'expired', 'rejected');

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  email text not null,
  phone text not null,
  parent_phone text not null,
  photo_url text,
  student_code text not null unique default ('EZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  grade text not null check (grade in ('3rd_preparatory', '1st_secondary', '2nd_secondary', '3rd_secondary')),
  educational_system text not null check (educational_system in ('general_secondary', 'baccalaureate')),
  role text not null default 'student' check (role = 'student'),
  account_status public.account_status not null default 'pending',
  subscription_status public.subscription_status not null default 'no_subscription',
  subscription_start timestamptz,
  subscription_expiration timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger student_profiles_updated_at
before update on public.student_profiles
for each row execute procedure public.set_updated_at();

create or replace function public.create_student_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_profiles (
    auth_user_id, full_name, email, phone, parent_phone, grade, educational_system
  ) values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Student'),
    lower(new.email),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'parent_phone',
    new.raw_user_meta_data ->> 'grade',
    new.raw_user_meta_data ->> 'educational_system'
  );
  return new;
end;
$$;

create trigger on_auth_user_created_student_profile
after insert on auth.users
for each row execute procedure public.create_student_profile_from_auth();

create table public.platform_roles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.assign_student_role_from_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.platform_roles (auth_user_id, role)
  values (new.id, 'student')
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_platform_role
after insert on auth.users
for each row execute procedure public.assign_student_role_from_auth();

alter table public.platform_roles enable row level security;
create policy "Users can read their own platform role"
on public.platform_roles for select to authenticated
using (auth.uid() = auth_user_id);

alter table public.student_profiles enable row level security;
create policy "Students can read their own profile"
on public.student_profiles for select to authenticated
using (auth.uid() = auth_user_id);
create policy "Students can update allowed profile fields"
on public.student_profiles for update to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id and role = 'student' and account_status = 'pending' and subscription_status = 'no_subscription');

insert into storage.buckets (id, name, public) values ('student-photos', 'student-photos', false)
on conflict (id) do nothing;
create policy "Students can upload their own photo"
on storage.objects for insert to authenticated
with check (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Students can read their own photo"
on storage.objects for select to authenticated
using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Students can replace their own photo"
on storage.objects for update to authenticated
using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'student-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create type public.payment_request_status as enum ('pending', 'approved', 'rejected');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_url text,
  grade text not null check (grade in ('3rd_preparatory', '1st_secondary', '2nd_secondary', '3rd_secondary')),
  educational_system text not null check (educational_system in ('general_secondary', 'baccalaureate')),
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'EGP' check (currency = 'EGP'),
  duration_days integer not null check (duration_days > 0),
  start_date date,
  end_date date,
  is_published boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger courses_updated_at
before update on public.courses
for each row execute procedure public.set_updated_at();

alter table public.courses enable row level security;
create policy "Anyone can read published courses"
on public.courses for select to anon, authenticated
using (is_published = true and status = 'published');

update public.courses set status = case when is_published then 'published' else 'draft' end;

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),
  payment_method text not null default 'instapay' check (payment_method = 'instapay'),
  transferred_from text not null,
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 3 and 100),
  screenshot_path text not null,
  note text check (note is null or char_length(note) <= 500),
  status public.payment_request_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index one_pending_payment_per_student_course
on public.payment_requests (student_id, course_id)
where status = 'pending';

create trigger payment_requests_updated_at
before update on public.payment_requests
for each row execute procedure public.set_updated_at();

alter table public.payment_requests enable row level security;
create policy "Students can read their own payment requests"
on public.payment_requests for select to authenticated
using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));

create policy "Teachers can review payment requests"
on public.payment_requests for select to authenticated
using (exists (select 1 from public.platform_roles where auth_user_id = auth.uid() and role = 'teacher'));
create policy "Teachers cannot directly mutate payment requests"
on public.payment_requests for update to authenticated
using (false)
with check (false);

create or replace function public.submit_payment_request(
  requested_course_id uuid,
  requested_transferred_from text,
  requested_transaction_reference text,
  requested_screenshot_path text,
  requested_note text default null
)
returns public.payment_requests
language plpgsql security definer set search_path = public
as $$
declare
  current_student_id uuid;
  selected_course public.courses;
  created_request public.payment_requests;
begin
  select id into current_student_id from public.student_profiles where auth_user_id = auth.uid() and role = 'student' and account_status = 'active';
  if current_student_id is null then raise exception 'student_not_allowed'; end if;
  select * into selected_course from public.courses where id = requested_course_id and is_published = true and status = 'published';
  if selected_course.id is null then raise exception 'course_not_available'; end if;
  if exists (select 1 from public.payment_requests where student_id = current_student_id and course_id = requested_course_id and status = 'pending') then raise exception 'pending_request_exists'; end if;
  if requested_transferred_from !~ '^(\+20|0020|0)?1[0125][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  if char_length(trim(requested_transaction_reference)) not between 3 and 100 then raise exception 'invalid_reference'; end if;
  if requested_screenshot_path !~ ('^' || current_student_id::text || '/[A-Za-z0-9_.-]+$') then raise exception 'invalid_screenshot_path'; end if;
  insert into public.payment_requests (student_id, course_id, amount, currency, transferred_from, transaction_reference, screenshot_path, note)
  values (current_student_id, requested_course_id, selected_course.price, selected_course.currency, requested_transferred_from, trim(requested_transaction_reference), requested_screenshot_path, nullif(trim(requested_note), ''))
  returning * into created_request;
  return created_request;
end;
$$;

insert into storage.buckets (id, name, public) values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;
create policy "Students can upload their own payment screenshot"
on storage.objects for insert to authenticated
with check (bucket_id = 'payment-screenshots' and (storage.foldername(name))[1] = (select id::text from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students can read their own payment screenshot"
on storage.objects for select to authenticated
using (bucket_id = 'payment-screenshots' and (storage.foldername(name))[1] = (select id::text from public.student_profiles where auth_user_id = auth.uid()));
create policy "Teachers can read payment screenshots"
on storage.objects for select to authenticated
using (bucket_id = 'payment-screenshots' and public.is_teacher());

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'pending' check (status in ('active', 'pending', 'expired', 'cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(student_id, course_id)
);
create trigger course_enrollments_updated_at before update on public.course_enrollments for each row execute procedure public.set_updated_at();
create table public.lessons (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  lesson_order integer not null, title text not null, description text not null default '', duration_minutes integer,
  lesson_date date, content_type text not null default 'mixed' check (content_type in ('video', 'pdf', 'text', 'mixed')), video_url text, youtube_url text, thumbnail_url text, material_url text, material_path text, availability text not null default 'draft' check (availability in ('draft', 'published', 'archived')), is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique(course_id, lesson_order)
);
create trigger lessons_updated_at before update on public.lessons for each row execute procedure public.set_updated_at();
create table public.lesson_completions (
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()), primary key(student_id, lesson_id)
);
create table public.exams (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  name text not null, description text not null default '', grade text, educational_system text, exam_date date, start_time time, end_time time, duration_minutes integer,
  maximum_attempts integer not null default 1 check (maximum_attempts > 0), passing_percentage numeric(5, 2) not null default 50 check (passing_percentage between 0 and 100),
  randomize_questions boolean not null default false, randomize_answers boolean not null default false, show_results boolean not null default true, allow_review boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')), is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create trigger exams_updated_at before update on public.exams for each row execute procedure public.set_updated_at();

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  question_text text not null, question_type text not null check (question_type in ('multiple_choice', 'true_false')), points numeric(8, 2) not null default 1 check (points > 0), question_order integer not null, created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), unique(exam_id, question_order)
);
create trigger exam_questions_updated_at before update on public.exam_questions for each row execute procedure public.set_updated_at();
create table public.exam_options (
  id uuid primary key default gen_random_uuid(), question_id uuid not null references public.exam_questions(id) on delete cascade,
  option_text text not null, option_order integer not null, is_correct boolean not null default false, unique(question_id, option_order)
);
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade, student_id uuid not null references public.student_profiles(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()), submitted_at timestamptz, score numeric(10, 2), maximum_score numeric(10, 2), percentage numeric(7, 4), passed boolean, attempt_number integer not null, status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')), unique(exam_id, student_id, attempt_number)
);
create table public.exam_answers (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.exam_attempts(id) on delete cascade, question_id uuid not null references public.exam_questions(id) on delete cascade,
  selected_option_id uuid references public.exam_options(id) on delete set null, answer_text text, points_awarded numeric(8, 2), feedback text, graded_by uuid references auth.users(id), graded_at timestamptz, unique(attempt_id, question_id)
);
create table public.grades (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(id) on delete cascade, exam_id uuid not null references public.exams(id) on delete cascade, attempt_id uuid references public.exam_attempts(id) on delete set null,
  score numeric(10, 2) not null default 0, maximum_score numeric(10, 2) not null check (maximum_score > 0), percentage numeric(7, 4) not null default 0, passed boolean not null default false, feedback text not null default '', graded_by uuid references auth.users(id), graded_at timestamptz, created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), unique(student_id, exam_id, attempt_id)
);
create trigger grades_updated_at before update on public.grades for each row execute procedure public.set_updated_at();
create table public.exam_results (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade, score numeric not null,
  total numeric not null check (total > 0), passed boolean, created_at timestamptz not null default timezone('utc', now()), unique(exam_id, student_id)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  attendance_date date not null,
  class_date date generated always as (attendance_date) stored,
  status text not null check (status in ('present', 'absent', 'late')),
  notes text not null default '',
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(student_id, course_id, lesson_id, attendance_date)
);
create trigger attendance_records_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();
create table public.notifications (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  title text not null, message text not null, read_at timestamptz, created_at timestamptz not null default timezone('utc', now())
);
create unique index notifications_announcement_student_idx on public.notifications (announcement_id, student_id) where announcement_id is not null;
create index payment_requests_reference_idx on public.payment_requests (transaction_reference);
create unique index payment_requests_student_reference_idx on public.payment_requests (student_id, transaction_reference);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, content text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_type text not null default 'now' check (publish_type in ('now', 'schedule')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create trigger announcements_updated_at before update on public.announcements for each row execute procedure public.set_updated_at();
create table public.announcement_targets (
  id uuid primary key default gen_random_uuid(), announcement_id uuid not null references public.announcements(id) on delete cascade,
  target_type text not null check (target_type in ('all', 'grade', 'educational_system', 'course', 'student')),
  grade text, educational_system text, course_id uuid references public.courses(id) on delete cascade, student_id uuid references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(announcement_id, target_type, grade, educational_system, course_id, student_id)
);
create table public.announcement_reads (
  id uuid primary key default gen_random_uuid(), announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade, read_at timestamptz not null default timezone('utc', now()),
  unique(announcement_id, student_id)
);
create table public.announcement_attachments (
  id uuid primary key default gen_random_uuid(), announcement_id uuid not null references public.announcements(id) on delete cascade,
  storage_path text not null, file_name text not null, file_type text not null, file_size integer not null check (file_size > 0),
  created_at timestamptz not null default timezone('utc', now())
);
create index announcement_targets_lookup_idx on public.announcement_targets (target_type, grade, educational_system, course_id, student_id);
create index announcement_reads_student_idx on public.announcement_reads (student_id, announcement_id);
create index announcements_status_date_idx on public.announcements (status, published_at, scheduled_at);
create table public.support_requests (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(id) on delete cascade,
  subject text not null, message text not null, status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.student_can_access_course(requested_course_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.courses c join public.student_profiles s on s.auth_user_id = auth.uid()
    where c.id = requested_course_id and c.is_published = true and c.status = 'published' and s.account_status = 'active'
    and (c.price = 0 or exists (select 1 from public.course_enrollments e where e.student_id = s.id and e.course_id = c.id and e.status = 'active' and (e.expires_at is null or e.expires_at > timezone('utc', now()))))
  );
$$;

create or replace function public.submit_exam_attempt(requested_exam_id uuid, requested_answers jsonb)
returns public.exam_attempts
language plpgsql security definer set search_path = public
as $$
declare
  current_student_id uuid;
  selected_exam public.exams;
  attempt public.exam_attempts;
  question_row record;
  selected_option uuid;
  is_answer_correct boolean;
  earned_score numeric := 0;
  maximum_score numeric := 0;
  next_attempt integer;
begin
  select id into current_student_id from public.student_profiles where auth_user_id = auth.uid() and role = 'student' and account_status = 'active';
  select * into selected_exam from public.exams where id = requested_exam_id and status = 'published' and is_published = true and (exam_date is null or exam_date >= current_date);
  if current_student_id is null or selected_exam.id is null or not public.student_can_access_course(selected_exam.course_id) then raise exception 'exam_not_available'; end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.exam_attempts where exam_id = requested_exam_id and student_id = current_student_id;
  if next_attempt > selected_exam.maximum_attempts then raise exception 'attempt_limit_reached'; end if;
  insert into public.exam_attempts (exam_id, student_id, attempt_number, status) values (requested_exam_id, current_student_id, next_attempt, 'submitted') returning * into attempt;
  for question_row in select q.id, q.points from public.exam_questions q where q.exam_id = requested_exam_id order by q.question_order loop
    maximum_score := maximum_score + question_row.points;
    selected_option := nullif(requested_answers ->> question_row.id::text, '')::uuid;
    select exists (select 1 from public.exam_options o where o.id = selected_option and o.question_id = question_row.id and o.is_correct) into is_answer_correct;
    if is_answer_correct then earned_score := earned_score + question_row.points; end if;
    insert into public.exam_answers (attempt_id, question_id, selected_option_id, points_awarded) values (attempt.id, question_row.id, selected_option, case when is_answer_correct then question_row.points else 0 end);
  end loop;
  update public.exam_attempts set submitted_at = timezone('utc', now()), score = earned_score, maximum_score = maximum_score, percentage = case when maximum_score > 0 then earned_score / maximum_score * 100 else 0 end, passed = case when maximum_score > 0 then earned_score / maximum_score * 100 >= selected_exam.passing_percentage else false end, status = 'graded' where id = attempt.id returning * into attempt;
  insert into public.grades (student_id, exam_id, attempt_id, score, maximum_score, percentage, passed, graded_at)
  values (current_student_id, requested_exam_id, attempt.id, attempt.score, attempt.maximum_score, attempt.percentage, attempt.passed, timezone('utc', now()));
  insert into public.exam_results (exam_id, student_id, score, total, passed) values (requested_exam_id, current_student_id, attempt.score, attempt.maximum_score, attempt.passed)
  on conflict (exam_id, student_id) do update set score = excluded.score, total = excluded.total, passed = excluded.passed, created_at = timezone('utc', now());
  return attempt;
end;
$$;

alter table public.course_enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_completions enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_options enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.grades enable row level security;
alter table public.exam_results enable row level security;
alter table public.attendance_records enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.announcement_attachments enable row level security;
alter table public.support_requests enable row level security;

create policy "Students read their enrollments" on public.course_enrollments for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read accessible lessons" on public.lessons for select to authenticated using (public.student_can_access_course(course_id) and is_published = true);
create policy "Students manage their completions" on public.lesson_completions for all to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid())) with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read assigned exams" on public.exams for select to authenticated using (public.student_can_access_course(course_id) and is_published = true and status = 'published' and (exam_date is null or exam_date >= current_date) and status <> 'closed');
create policy "Students read eligible questions" on public.exam_questions for select to authenticated using (exists (select 1 from public.exams e where e.id = exam_id and public.student_can_access_course(e.course_id) and e.status = 'published' and e.is_published = true));
create policy "Students read eligible options" on public.exam_options for select to authenticated using (exists (select 1 from public.exam_questions q join public.exams e on e.id = q.exam_id where q.id = question_id and public.student_can_access_course(e.course_id) and e.status = 'published' and e.is_published = true));
create policy "Students manage own attempts" on public.exam_attempts for all to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid())) with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()) and exists (select 1 from public.exams e where e.id = exam_id and public.student_can_access_course(e.course_id) and e.status = 'published' and e.is_published = true));
create policy "Students manage own answers" on public.exam_answers for all to authenticated using (attempt_id in (select id from public.exam_attempts where student_id in (select id from public.student_profiles where auth_user_id = auth.uid()))) with check (attempt_id in (select id from public.exam_attempts where student_id in (select id from public.student_profiles where auth_user_id = auth.uid())));
create policy "Students read their results" on public.exam_results for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read own grades" on public.grades for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read attendance" on public.attendance_records for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read notifications" on public.notifications for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students update notifications" on public.notifications for update to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid())) with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students read targeted announcements" on public.announcements for select to authenticated using (public.student_can_see_announcement(id));
create policy "Students read visible announcement targets" on public.announcement_targets for select to authenticated using (public.student_can_see_announcement(announcement_id));
create policy "Students read visible announcement attachments" on public.announcement_attachments for select to authenticated using (public.student_can_see_announcement(announcement_id));
create policy "Students read own announcement reads" on public.announcement_reads for select to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students create own announcement reads" on public.announcement_reads for insert to authenticated with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()) and public.student_can_see_announcement(announcement_id));
create policy "Students update own announcement reads" on public.announcement_reads for update to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid())) with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));
create policy "Students manage support requests" on public.support_requests for all to authenticated using (student_id in (select id from public.student_profiles where auth_user_id = auth.uid())) with check (student_id in (select id from public.student_profiles where auth_user_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('course-assets', 'course-assets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('announcement-attachments', 'announcement-attachments', false) on conflict (id) do nothing;

-- Teacher-only access is enforced in PostgreSQL, not only by the client router.
create or replace function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.platform_roles where auth_user_id = auth.uid() and role = 'teacher');
$$;

create or replace function public.student_can_see_announcement(requested_announcement_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.student_profiles s
    join public.announcements a on a.id = requested_announcement_id
    join public.announcement_targets t on t.announcement_id = a.id
    where s.auth_user_id = auth.uid() and s.role = 'student' and s.account_status = 'active'
      and a.status = 'published' and a.published_at <= timezone('utc', now())
      and (t.target_type = 'all' or (t.target_type = 'grade' and t.grade = s.grade)
        or (t.target_type = 'educational_system' and t.educational_system = s.educational_system)
        or (t.target_type = 'student' and t.student_id = s.id)
        or (t.target_type = 'course' and exists (select 1 from public.course_enrollments e where e.student_id = s.id and e.course_id = t.course_id and e.status = 'active')))
  );
$$;

create table public.expenses (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null check (category in ('advertising', 'printing', 'equipment', 'transportation', 'software', 'teaching_materials', 'internet_technology', 'other')),
  amount numeric(10, 2) not null check (amount > 0), currency text not null default 'EGP' check (currency = 'EGP'), expense_date date not null default current_date, notes text not null default '',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz
);
create trigger expenses_updated_at before update on public.expenses for each row execute procedure public.set_updated_at();
create index expenses_date_idx on public.expenses (expense_date);
create index expenses_category_idx on public.expenses (category);
create index expenses_creator_idx on public.expenses (created_by);

create table public.teacher_notifications (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, title text not null, message text not null, related_table text, related_record_id uuid,
  read_at timestamptz, created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), action text not null, teacher_id uuid not null references auth.users(id),
  related_table text, related_record_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.audit_course_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_teacher() then
    insert into public.audit_logs (action, teacher_id, related_table, related_record_id, metadata)
    values (lower(TG_TABLE_NAME || '_' || TG_OP), auth.uid(), TG_TABLE_NAME, coalesce(new.id, old.id), '{}'::jsonb);
  end if;
  return new;
end;
$$;
create or replace function public.keep_record_creator()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if TG_OP = 'INSERT' and new.created_by <> auth.uid() then raise exception 'creator_mismatch'; end if;
  if TG_OP = 'UPDATE' then new.created_by = old.created_by; end if;
  return new;
end;
$$;
create trigger expenses_creator_guard before insert or update on public.expenses for each row execute procedure public.keep_record_creator();
create trigger announcements_creator_guard before insert or update on public.announcements for each row execute procedure public.keep_record_creator();
create trigger audit_courses after insert or update on public.courses for each row execute procedure public.audit_course_change();
create trigger audit_lessons after insert or update on public.lessons for each row execute procedure public.audit_course_change();
create trigger audit_attendance after insert or update on public.attendance_records for each row execute procedure public.audit_course_change();
create trigger audit_expenses after insert or update on public.expenses for each row execute procedure public.audit_course_change();
create trigger audit_announcements after insert or update on public.announcements for each row execute procedure public.audit_course_change();

create or replace function public.assign_student_code(requested_student_id uuid)
returns public.student_profiles language plpgsql security definer set search_path = public as $$
declare student_row public.student_profiles; generated_code text;
begin
  if not public.is_teacher() then raise exception 'teacher_not_allowed'; end if;
  select * into student_row from public.student_profiles where id = requested_student_id and role = 'student' for update;
  if student_row.id is null then raise exception 'student_not_found'; end if;
  if student_row.student_code is not null then raise exception 'student_code_exists'; end if;
  loop
    generated_code := 'ABR-' || extract(year from timezone('utc', now()))::text || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.student_profiles where student_code = generated_code);
  end loop;
  update public.student_profiles set student_code = generated_code where id = requested_student_id returning * into student_row;
  insert into public.audit_logs (action, teacher_id, related_table, related_record_id, metadata) values ('student_code_generated', auth.uid(), 'student_profiles', requested_student_id, jsonb_build_object('code', generated_code));
  return student_row;
end;
$$;
grant execute on function public.assign_student_code(uuid) to authenticated;

create or replace function public.notify_announcement_recipients(requested_announcement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (student_id, announcement_id, title, message)
  select s.id, requested_announcement_id, 'New announcement from Mr Abdelrahman Mohamed', a.title
  from public.student_profiles s
  join public.announcements a on a.id = requested_announcement_id
  where s.role = 'student' and s.account_status = 'active'
    and exists (select 1 from public.announcement_targets t where t.announcement_id = a.id
      and (t.target_type = 'all' or (t.target_type = 'grade' and t.grade = s.grade)
        or (t.target_type = 'educational_system' and t.educational_system = s.educational_system)
        or (t.target_type = 'student' and t.student_id = s.id)
        or (t.target_type = 'course' and exists (select 1 from public.course_enrollments e where e.student_id = s.id and e.course_id = t.course_id and e.status = 'active')))
  on conflict (announcement_id, student_id) do nothing;
end;
$$;

create or replace function public.publish_announcement(requested_announcement_id uuid)
returns public.announcements language plpgsql security definer set search_path = public as $$
declare published public.announcements;
begin
  if not public.is_teacher() then raise exception 'teacher_not_allowed'; end if;
  update public.announcements set status = 'published', publish_type = 'now', published_at = timezone('utc', now()), scheduled_at = null where id = requested_announcement_id and status in ('draft', 'scheduled') returning * into published;
  if published.id is null then raise exception 'announcement_not_publishable'; end if;
  perform public.notify_announcement_recipients(published.id);
  insert into public.audit_logs (action, teacher_id, related_table, related_record_id) values ('announcement_published', auth.uid(), 'announcements', published.id);
  return published;
end;
$$;
grant execute on function public.publish_announcement(uuid) to authenticated;

create or replace function public.publish_due_announcements()
returns integer language plpgsql security definer set search_path = public as $$
declare announcement_row public.announcements; published_count integer := 0;
begin
  for announcement_row in select * from public.announcements where status = 'scheduled' and scheduled_at <= timezone('utc', now()) loop
    update public.announcements set status = 'published', published_at = timezone('utc', now()), scheduled_at = null where id = announcement_row.id;
    perform public.notify_announcement_recipients(announcement_row.id);
    published_count := published_count + 1;
  end loop;
  return published_count;
end;
$$;
grant execute on function public.publish_due_announcements() to authenticated;

create or replace function public.mark_announcement_read(requested_announcement_id uuid)
returns public.announcement_reads language plpgsql security definer set search_path = public as $$
declare current_student_id uuid; marked public.announcement_reads;
begin
  select id into current_student_id from public.student_profiles where auth_user_id = auth.uid() and role = 'student' and account_status = 'active';
  if current_student_id is null or not public.student_can_see_announcement(requested_announcement_id) then raise exception 'announcement_not_available'; end if;
  insert into public.announcement_reads (announcement_id, student_id, read_at) values (requested_announcement_id, current_student_id, timezone('utc', now()))
  on conflict (announcement_id, student_id) do update set read_at = excluded.read_at returning * into marked;
  return marked;
end;
$$;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

create or replace function public.review_payment_request(requested_payment_id uuid, decision text, requested_rejection_reason text default null)
returns public.payment_requests
language plpgsql security definer set search_path = public
as $$
declare
  payment_row public.payment_requests;
  course_row public.courses;
  reviewed public.payment_requests;
  start_at timestamptz := timezone('utc', now());
begin
  if not public.is_teacher() then raise exception 'teacher_not_allowed'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'invalid_payment_decision'; end if;
  select * into payment_row from public.payment_requests where id = requested_payment_id for update;
  if payment_row.id is null then raise exception 'payment_not_found'; end if;
  if payment_row.status <> 'pending' then raise exception 'payment_already_reviewed'; end if;
  if decision = 'rejected' and char_length(trim(coalesce(requested_rejection_reason, ''))) < 3 then raise exception 'rejection_reason_required'; end if;
  if decision = 'approved' then
    select * into course_row from public.courses where id = payment_row.course_id;
    insert into public.course_enrollments (student_id, course_id, status, starts_at, expires_at)
    values (payment_row.student_id, payment_row.course_id, 'active', start_at, start_at + make_interval(days => course_row.duration_days))
    on conflict (student_id, course_id) do update set status = 'active', starts_at = excluded.starts_at, expires_at = excluded.expires_at, updated_at = timezone('utc', now());
    update public.student_profiles set subscription_status = 'active', subscription_start = start_at, subscription_expiration = start_at + make_interval(days => course_row.duration_days) where id = payment_row.student_id;
    insert into public.notifications (student_id, title, message) values (payment_row.student_id, 'Payment approved', 'Your payment has been approved. Your course is now active.');
  else
    insert into public.notifications (student_id, title, message) values (payment_row.student_id, 'Payment rejected', 'Your payment was rejected. Reason: ' || trim(requested_rejection_reason));
  end if;
  update public.payment_requests set status = decision::public.payment_request_status, reviewed_by = auth.uid(), reviewed_at = start_at, rejection_reason = case when decision = 'rejected' then trim(requested_rejection_reason) else null end where id = requested_payment_id returning * into reviewed;
  insert into public.audit_logs (action, teacher_id, related_table, related_record_id, metadata) values ('payment_' || decision, auth.uid(), 'payment_requests', requested_payment_id, jsonb_build_object('rejection_reason', requested_rejection_reason));
  return reviewed;
end;
$$;
grant execute on function public.review_payment_request(uuid, text, text) to authenticated;

create table public.student_codes (
  id uuid primary key default gen_random_uuid(), code text not null unique, student_id uuid references public.student_profiles(id) on delete set null,
  is_active boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create index student_profiles_code_idx on public.student_profiles (student_code);
create index student_profiles_phone_idx on public.student_profiles (phone);
create index student_profiles_grade_system_idx on public.student_profiles (grade, educational_system);

alter table public.expenses enable row level security;
alter table public.teacher_notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.student_codes enable row level security;

create policy "Teachers read expenses" on public.expenses for select to authenticated using (public.is_teacher());
create policy "Teachers create expenses" on public.expenses for insert to authenticated with check (public.is_teacher() and created_by = auth.uid());
create policy "Teachers update expenses" on public.expenses for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers read notifications" on public.teacher_notifications for select to authenticated using (public.is_teacher() and teacher_id = auth.uid());
create policy "Teachers update notifications" on public.teacher_notifications for update to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());
create policy "Teachers create audit logs" on public.audit_logs for insert to authenticated with check (public.is_teacher() and teacher_id = auth.uid());
create policy "Teachers read audit logs" on public.audit_logs for select to authenticated using (public.is_teacher());
create policy "Teachers manage student codes" on public.student_codes for all to authenticated using (public.is_teacher()) with check (public.is_teacher() and created_by = auth.uid());
create policy "Teachers manage course assets" on storage.objects for all to authenticated using (bucket_id = 'course-assets' and public.is_teacher()) with check (bucket_id = 'course-assets' and public.is_teacher());
create policy "Teachers manage announcement attachments" on storage.objects for all to authenticated using (bucket_id = 'announcement-attachments' and public.is_teacher()) with check (bucket_id = 'announcement-attachments' and public.is_teacher());
create policy "Students read visible announcement attachments" on storage.objects for select to authenticated using (bucket_id = 'announcement-attachments' and exists (select 1 from public.announcement_attachments aa where aa.storage_path = name and public.student_can_see_announcement(aa.announcement_id)));

create or replace function public.notify_teachers(event_name text, event_title text, event_message text, source_table text, source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.teacher_notifications (teacher_id, event_type, title, message, related_table, related_record_id)
  select auth_user_id, event_name, event_title, event_message, source_table, source_id
  from public.platform_roles where role = 'teacher';
end;
$$;

create or replace function public.notify_new_student()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_teachers('student_registration', 'New student registration', new.full_name || ' registered on the platform.', 'student_profiles', new.id);
  return new;
end;
$$;
create trigger notify_teachers_on_student_registration after insert on public.student_profiles for each row execute procedure public.notify_new_student();

create or replace function public.notify_new_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_teachers('payment_submitted', 'Payment submitted', 'A new payment request is waiting for review.', 'payment_requests', new.id);
  return new;
end;
$$;
create trigger notify_teachers_on_payment after insert on public.payment_requests for each row execute procedure public.notify_new_payment();

-- Existing platform entities are readable by an authenticated teacher and writable only by one.
create policy "Teachers manage students" on public.student_profiles for all to authenticated using (public.is_teacher()) with check (public.is_teacher() and role = 'student');
create policy "Teachers manage courses" on public.courses for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage enrollments" on public.course_enrollments for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage lessons" on public.lessons for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exams" on public.exams for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exam questions" on public.exam_questions for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exam options" on public.exam_options for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exam attempts" on public.exam_attempts for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exam answers" on public.exam_answers for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage grades" on public.grades for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage legacy exam results" on public.exam_results for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage exam results" on public.exam_results for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage attendance" on public.attendance_records for all to authenticated using (public.is_teacher()) with check (public.is_teacher() and recorded_by = auth.uid());
create policy "Teachers manage announcements" on public.announcements for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage announcement targets" on public.announcement_targets for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage announcement reads" on public.announcement_reads for select to authenticated using (public.is_teacher());
create policy "Teachers manage announcement attachments" on public.announcement_attachments for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "Teachers manage support requests" on public.support_requests for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create or replace function public.verify_student_card(requested_code text)
returns table (full_name text, student_code text, grade text, educational_system text, account_status text, subscription_status text)
language sql security definer stable set search_path = public as $$
  select s.full_name, s.student_code, s.grade, s.educational_system, s.account_status::text, s.subscription_status::text
  from public.student_profiles s where s.student_code = upper(trim(requested_code)) and s.account_status <> 'suspended';
$$;
grant execute on function public.verify_student_card(text) to anon, authenticated;