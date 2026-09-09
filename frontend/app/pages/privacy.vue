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
            トレ部（以下「本サービス」）を運営するトレ部 運用事務局（以下「運営者」）は、
            ユーザーの個人情報を以下の方針に基づいて取り扱います。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">1. 運営者情報</h2>
          <p>
            運営者：トレ部 運用事務局<br />
            お問い合わせ先：torebu@gmail.com
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">2. 収集する情報</h2>
          <p>本サービスは、ユーザーの登録・利用にあたり、以下の情報を収集します。</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>メールアドレス、パスワード</li>
            <li>表示名</li>
            <li>生年月、性別、職業</li>
            <li>
              トレーニング記録（種目・重量・回数・記録日時等）、ルーティン、グループ内でのリアクション・
              コメント
            </li>
            <li>グループの作成・参加状況</li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">3. 利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>本サービスの提供（ログイン認証、記録の保存・表示、グループ内での共有・ランキング表示等）</li>
            <li>不正利用の防止、お問い合わせへの対応</li>
            <li>
              生年月・性別・職業は、将来的に属性別の傾向分析機能（例：年代別のトレーニング傾向表示）の
              提供に利用する場合があります
            </li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">4. 個人情報の第三者提供</h2>
          <p>
            運営者は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">5. 個人情報の取扱いの委託</h2>
          <p>
            本サービスの運営に必要な範囲で、データベースホスティング等のインフラ事業者に個人情報の
            取扱いを委託することがあります。委託先には利用目的の達成に必要な範囲でのみデータを提供し、
            適切な管理を求めています。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">6. 保有個人データの開示・訂正・利用停止等</h2>
          <p>
            ユーザーは、運営者に対し、自身の個人情報の開示、訂正、利用停止、削除等を求めることができます。
            ご希望の場合は、上記お問い合わせ先までご連絡ください。本人確認のうえ、法令に従い遅滞なく
            対応します。
          </p>
          <p class="mt-2">※アカウント削除専用の機能は現在準備中です。</p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">7. グループ機能における公開範囲</h2>
          <p>
            トレーニング記録・リアクション・コメントは、ユーザーが参加しているグループの他のメンバーに
            表示されます。表示名は、同じグループの他のメンバーおよび記録に対してリアクション・コメントを
            行った際に、そのやり取りの相手に表示されます。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">8. 情報の保存期間</h2>
          <p>
            ユーザーの情報は、アカウントが存在する間保存します。ただし、長期間本サービスの利用がない
            アカウントについては、事前に通知のうえ情報を削除することがあります。
          </p>
        </section>

        <section>
          <h2 class="mb-2 font-semibold text-gray-900">9. 本ポリシーの変更</h2>
          <p>
            運営者は、必要と判断した場合には、本ポリシーの内容を変更することがあります。変更後の内容は、
            本サービス上に表示した時点から効力を生じます。
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
