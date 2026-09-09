<script setup lang="ts">
// プライバシーポリシー（Issue #160）。
// ミドルウェアは付けない：ログイン前（新規登録画面）・ログイン後どちらからも参照できる必要があるため
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-8">
    <div class="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow">
      <h1 class="mb-1 text-xl font-bold text-gray-900">プライバシーポリシー</h1>
      <p class="mb-6 text-xs text-gray-500">最終更新日：2026年9月9日</p>

      <div class="space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <p>
            トレ部（以下「本サービス」）の運営者（以下「運営者」）は、ユーザーの個人情報を以下の方針に
            基づいて取り扱います。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">1. 収集する情報</h2>
          <p>本サービスは、ユーザーの登録・利用にあたり、以下の情報を収集します。</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>メールアドレス、パスワード（ハッシュ化して保存し、運営者も内容を復元できません）</li>
            <li>表示名</li>
            <li>生年月（年月のみ）、性別、職業（いずれも「回答しない」を選択できます）</li>
            <li>
              トレーニング記録（種目・重量・回数・記録日時等）、ルーティン、グループ内でのリアクション・
              コメント
            </li>
            <li>グループの作成・参加状況</li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">2. 利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>本サービスの提供（ログイン認証、記録の保存・表示、グループ内での共有・ランキング表示等）</li>
            <li>不正利用の防止、お問い合わせへの対応</li>
            <li>
              生年月・性別・職業は、将来的に属性別の傾向分析機能（例：年代別のトレーニング傾向表示）を
              提供する目的で収集します。現時点では個人を特定した分析・第三者への提供は行っていません
            </li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">3. 第三者提供</h2>
          <p>
            運営者は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。
            なお、以下の外部サービスをインフラとして利用しており、これらの事業者は本サービスの
            運営に必要な範囲でデータを取り扱います（それぞれの事業者のプライバシーポリシーが適用されます）。
          </p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>Neon（データベースホスティング）</li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">4. グループ機能における公開範囲</h2>
          <p>
            トレーニング記録・リアクション・コメントは、ユーザーが参加しているグループの他のメンバーに
            表示されます。表示名は、同じグループの他のメンバーおよび記録に対してリアクション・コメントを
            行った際に、そのやり取りの相手に表示されます。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">5. 情報の保存期間・削除</h2>
          <p>
            ユーザーの情報は、アカウントが存在する間保存します。アカウント削除の方法については、
            現時点では専用の機能を準備中です。削除をご希望の場合は、下記のお問い合わせ先までご連絡ください。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">6. 本ポリシーの変更</h2>
          <p>
            運営者は、必要と判断した場合には、本ポリシーの内容を変更することがあります。変更後の内容は、
            本サービス上に表示した時点から効力を生じます。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">7. 運営者情報・お問い合わせ</h2>
          <p>
            運営者：ConniConni（個人運営）<br />
            お問い合わせ先：nmtgktmo@gmail.com
          </p>
        </section>
      </div>

      <p class="mt-8 text-center text-sm text-gray-600">
        <NuxtLink to="/terms" class="text-brand-600 hover:underline">利用規約</NuxtLink>
        ・
        <NuxtLink to="/" class="text-brand-600 hover:underline">トップへ戻る</NuxtLink>
      </p>
    </div>
  </div>
</template>
