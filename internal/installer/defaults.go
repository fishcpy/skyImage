package installer

// DefaultTermsOfService 默认服务条款内容
const DefaultTermsOfService = `<div class="space-y-6">
  <p class="text-muted-foreground">最后更新日期：2024年</p>
  
  <section>
    <h2 class="text-xl font-semibold mb-3">1. 服务条款的接受</h2>
    <p>欢迎使用本图床服务。通过访问或使用我们的服务，您同意受本服务条款的约束。如果您不同意这些条款，请不要使用我们的服务。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">2. 服务说明</h2>
    <p>本服务提供图片托管和分享功能。我们保留随时修改或终止服务（或其任何部分）的权利，无论是否通知。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">3. 用户账户</h2>
    <p>您需要创建账户才能使用某些功能。您有责任：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>维护账户信息的准确性</li>
      <li>保护账户密码的安全</li>
      <li>对账户下发生的所有活动负责</li>
      <li>立即通知我们任何未经授权的使用</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">4. 用户内容</h2>
    <p>您对上传到本服务的所有内容负责。您保证：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>您拥有或有权上传该内容</li>
      <li>内容不侵犯任何第三方的权利</li>
      <li>内容不违反任何法律法规</li>
      <li>内容不包含恶意软件或有害代码</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">5. 禁止行为</h2>
    <p>使用我们的服务时，您不得：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>上传非法、有害、威胁、辱骂、骚扰、诽谤、粗俗、淫秽或其他令人反感的内容</li>
      <li>侵犯任何专利、商标、商业秘密、版权或其他知识产权</li>
      <li>上传包含病毒或其他有害代码的文件</li>
      <li>干扰或破坏服务或服务器</li>
      <li>使用自动化手段访问服务</li>
      <li>冒充他人或虚假陈述与他人的关系</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">6. 知识产权</h2>
    <p>服务及其原始内容、功能和特性归本服务所有，受国际版权、商标、专利、商业秘密和其他知识产权法律的保护。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">7. 内容删除</h2>
    <p>我们保留删除任何违反这些条款或我们认为不适当的内容的权利，无需事先通知。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">8. 服务终止</h2>
    <p>我们可以立即终止或暂停您的账户和访问权限，无需事先通知或承担责任，原因包括但不限于违反服务条款。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">9. 免责声明</h2>
    <p>服务按"原样"和"可用"基础提供。本服务不保证服务将不间断、安全或无错误。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">10. 责任限制</h2>
    <p>在任何情况下，本服务及其董事、员工、合作伙伴、代理、供应商或关联公司均不对任何间接、偶然、特殊、后果性或惩罚性损害负责。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">11. 条款变更</h2>
    <p>我们保留随时修改或替换这些条款的权利。如果修订是实质性的，我们将提供至少 30 天的通知。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">12. 联系我们</h2>
    <p>如果您对这些服务条款有任何疑问，请通过网站提供的联系方式与我们联系。</p>
  </section>
</div>`

// DefaultPrivacyPolicy 默认隐私政策内容
const DefaultPrivacyPolicy = `<div class="space-y-6">
  <p class="text-muted-foreground">最后更新日期：2024年</p>
  
  <section>
    <h2 class="text-xl font-semibold mb-3">1. 引言</h2>
    <p>本服务重视您的隐私。本隐私政策说明了我们如何收集、使用、披露和保护您的个人信息。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">2. 我们收集的信息</h2>
    <h3 class="text-lg font-semibold mt-4 mb-2">2.1 您提供的信息</h3>
    <ul class="list-disc pl-6 space-y-2">
      <li><strong>账户信息：</strong>注册时提供的用户名、邮箱地址和密码</li>
      <li><strong>上传内容：</strong>您上传到服务的图片和相关元数据</li>
      <li><strong>通信信息：</strong>您与我们联系时提供的信息</li>
    </ul>

    <h3 class="text-lg font-semibold mt-4 mb-2">2.2 自动收集的信息</h3>
    <ul class="list-disc pl-6 space-y-2">
      <li><strong>使用数据：</strong>访问时间、浏览的页面、点击的链接</li>
      <li><strong>设备信息：</strong>IP 地址、浏览器类型、操作系统</li>
      <li><strong>Cookie：</strong>用于维护会话和改善用户体验</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">3. 信息使用方式</h2>
    <p>我们使用收集的信息用于：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>提供、维护和改进我们的服务</li>
      <li>处理您的请求和交易</li>
      <li>向您发送技术通知、更新和安全警报</li>
      <li>响应您的评论和问题</li>
      <li>监控和分析使用趋势</li>
      <li>检测、预防和解决技术问题</li>
      <li>保护服务的安全性和完整性</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">4. 信息共享</h2>
    <p>我们不会出售您的个人信息。我们可能在以下情况下共享信息：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li><strong>经您同意：</strong>在获得您明确同意的情况下</li>
      <li><strong>服务提供商：</strong>与帮助我们运营服务的第三方服务提供商</li>
      <li><strong>法律要求：</strong>遵守法律义务或响应合法请求</li>
      <li><strong>业务转让：</strong>在合并、收购或资产出售的情况下</li>
      <li><strong>保护权利：</strong>保护本服务、用户或公众的权利、财产或安全</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">5. 公开内容</h2>
    <p>您上传的标记为"公开"的图片可能会被其他用户查看。请谨慎选择公开分享的内容。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">6. 数据安全</h2>
    <p>我们采取合理的技术和组织措施来保护您的个人信息，包括：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>加密传输（HTTPS）</li>
      <li>安全的密码存储（哈希和加盐）</li>
      <li>定期安全审计</li>
      <li>访问控制和权限管理</li>
    </ul>
    <p class="mt-2">但请注意，没有任何互联网传输或电子存储方法是 100% 安全的。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">7. 数据保留</h2>
    <p>我们会保留您的个人信息，只要您的账户处于活动状态或需要提供服务。您可以随时请求删除您的账户和数据。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">8. 您的权利</h2>
    <p>您对您的个人信息拥有以下权利：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li><strong>访问权：</strong>请求访问我们持有的关于您的个人信息</li>
      <li><strong>更正权：</strong>请求更正不准确的个人信息</li>
      <li><strong>删除权：</strong>请求删除您的个人信息</li>
      <li><strong>限制处理权：</strong>请求限制对您个人信息的处理</li>
      <li><strong>数据可携权：</strong>请求以结构化、常用和机器可读的格式接收您的数据</li>
      <li><strong>反对权：</strong>反对处理您的个人信息</li>
    </ul>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">9. Cookie 政策</h2>
    <p>我们使用 Cookie 和类似技术来：</p>
    <ul class="list-disc pl-6 space-y-2 mt-2">
      <li>保持您的登录状态</li>
      <li>记住您的偏好设置</li>
      <li>分析网站流量和使用情况</li>
    </ul>
    <p class="mt-2">您可以通过浏览器设置控制 Cookie 的使用，但这可能会影响某些功能。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">10. 儿童隐私</h2>
    <p>我们的服务不面向 13 岁以下的儿童。我们不会有意收集 13 岁以下儿童的个人信息。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">11. 国际数据传输</h2>
    <p>您的信息可能会被传输到您所在国家/地区以外的服务器。我们会采取措施确保您的数据得到适当保护。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">12. 隐私政策变更</h2>
    <p>我们可能会不时更新本隐私政策。我们将通过在网站上发布新的隐私政策来通知您任何变更。建议您定期查看本页面以了解任何变更。</p>
  </section>

  <section>
    <h2 class="text-xl font-semibold mb-3">13. 联系我们</h2>
    <p>如果您对本隐私政策有任何疑问或疑虑，请通过网站提供的联系方式与我们联系。</p>
  </section>
</div>`
