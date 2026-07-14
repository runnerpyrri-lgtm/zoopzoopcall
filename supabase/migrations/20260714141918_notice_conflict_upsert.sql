-- 같은 공고·필드의 최신 공식 출처 충돌을 한 행으로 갱신한다.
delete from public.notice_collection_conflicts older
using public.notice_collection_conflicts newer
where older.notice_key = newer.notice_key
  and older.field_name = newer.field_name
  and older.id < newer.id;

alter table public.notice_collection_conflicts
  add constraint notice_collection_conflicts_notice_field_key
  unique (notice_key, field_name);
