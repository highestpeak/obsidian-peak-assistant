/**
 * Embedded mock response content for browser environment
 * This content includes comprehensive examples of various markdown elements
 */
export const MOCK_RESPONSE_CONTENT = `# Comprehensive AI Response Examples

This document contains various examples of AI responses with different content types for testing stream chat functionality. It includes code blocks, mathematical expressions, diagrams, tables, and mixed content formats. Almost all text is in English, with only one dedicated chapter (Chapter 1) specifically testing CJK language support.

## 1. CJK Language Support

This section specifically tests Chinese, Japanese, and Korean character support in the system.

### Chinese Content Test (中文测试)
您好！这是一个专门测试中文字符支持的章节。系统需要能够正确处理和显示中文字符，包括复杂的句子结构和技术术语。

人工智能（Artificial Intelligence）是指模拟人类智能的计算机系统。它包括以下主要领域：
- 机器学习（Machine Learning）：让计算机从数据中学习模式
- 深度学习（Deep Learning）：使用神经网络进行复杂模式识别
- 自然语言处理（Natural Language Processing）：理解和生成人类语言
- 计算机视觉（Computer Vision）：让机器"看懂"图像和视频

### Japanese Content Test (日本語テスト)
こんにちは！これは日本語の文字サポートをテストするためのセクションです。システムは日本語の文字を正しく処理し表示する必要があります。

人工知能（Artificial Intelligence）は人間の知能をシミュレートするコンピュータシステムを指します。主要な分野：
- 機械学習（Machine Learning）：データからパターンを学習する
- 深層学習（Deep Learning）：複雑なパターン認識にニューラルネットワークを使用
- 自然言語処理（Natural Language Processing）：人間の言語を理解し生成する
- コンピュータビジョン（Computer Vision）：画像とビデオを解釈する

### Korean Content Test (한국어 테스트)
안녕하세요! 이것은 한국어 문자 지원을 테스트하기 위한 섹션입니다. 시스템이 한국어 문자를 올바르게 처리하고 표시해야 합니다.

인공지능(Artificial Intelligence)은 인간 지능을 시뮬레이션하는 컴퓨터 시스템을 의미합니다. 주요 분야:
- 기계 학습(Machine Learning): 데이터에서 패턴을 학습
- 딥 러닝(Deep Learning): 복잡한 패턴 인식에 신경망 사용
- 자연어 처리(Natural Language Processing): 인간 언어 이해 및 생성
- 컴퓨터 비전(Computer Vision): 이미지와 비디오 해석

## 2. Code Blocks

### Python Example
\`\`\`python
def fibonacci(n):
    """Generate the first n terms of the Fibonacci sequence"""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]

    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i-1] + sequence[i-2])
    return sequence

# Test code
print(fibonacci(10))  # Output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
\`\`\`

### JavaScript Example
\`\`\`javascript
// Async function example
async function fetchUserData(userId) {
    try {
        const response = await fetch(\`/api/users/\${userId}\`);
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        const userData = await response.json();
        return userData;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
}

// Usage example
const user = await fetchUserData(123);
console.log(user);
\`\`\`

### SQL Query
\`\`\`sql
-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert test data
INSERT INTO users (username, email) VALUES
('alice', 'alice@example.com'),
('bob', 'bob@example.com'),
('charlie', 'charlie@example.com');

-- Query active users
SELECT username, email, created_at
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
\`\`\`

## 3. Mathematical Expressions

### Basic Algebra
The solution to the quadratic equation $ax^2 + bx + c = 0$ is:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

### Calculus
The derivative of the function $f(x) = x^2$ is:
$$\\frac{df}{dx} = 2x$$

Definite integral calculation:
$$\\int_{0}^{1} x^2 \\, dx = \\left[\\frac{x^3}{3}\\right]_{0}^{1} = \\frac{1}{3}$$

### Linear Algebra
Matrix multiplication:
$$\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
\\begin{pmatrix}
x \\\\
y
\\end{pmatrix}
=
\\begin{pmatrix}
ax + by \\\\
cx + dy
\\end{pmatrix}$$

## 4. Mermaid Diagrams

### Flowchart
\`\`\`mermaid
graph TD
    A[Start] --> B{Is logged in?}
    B -->|Yes| C[Show homepage]
    B -->|No| D[Show login page]
    D --> E[Enter credentials]
    E --> F{Validation successful?}
    F -->|Yes| C
    F -->|No| G[Show error message]
    G --> E
    C --> H[User actions]
    H --> I{Log out?}
    I -->|Yes| A
    I -->|No| H
\`\`\`

### Gantt Chart
\`\`\`mermaid
gantt
    title Project Development Plan
    dateFormat YYYY-MM-DD
    section Requirements Analysis
    Requirements research          :done, req1, 2024-01-01, 2024-01-10
    Documentation writing      :done, req2, after req1, 5d
    section Design Phase
    System design          :active, des1, 2024-01-16, 10d
    UI/UX design         :des2, after des1, 7d
    section Development Phase
    Frontend development          :dev1, after des2, 15d
    Backend development          :dev2, after des2, 20d
    Integration testing          :test1, after dev1 dev2, 5d
    section Deployment
    Deployment preparation          :dep1, after test1, 3d
    Production deployment          :milestone, dep2, after dep1, 1d
\`\`\`

### Mind Map
\`\`\`mermaid
mindmap
  root((Artificial Intelligence))
    Machine Learning
      Supervised Learning
        Classification
        Regression
      Unsupervised Learning
        Clustering
        Dimensionality Reduction
      Reinforcement Learning
    Deep Learning
      Neural Networks
        Convolutional Neural Networks
        Recurrent Neural Networks
        Transformer
      Large Language Models
        GPT Series
        BERT
        Claude
    Application Areas
      Natural Language Processing
      Computer Vision
      Recommendation Systems
      Autonomous Driving
\`\`\`

## 5. Tables

### Programming Language Comparison

| Language | Type | Main Uses | Learning Difficulty |
|----------|------|-----------|-------------------|
| Python | Dynamic | Data Science, Web Development, AI | Low |
| JavaScript | Dynamic | Web Frontend, Node.js Backend | Medium |
| Java | Static | Enterprise Apps, Android Development | Medium-High |
| C++ | Static | System Programming, Game Development | High |
| Rust | Static | System Programming, High-Security Apps | High |

### Performance Comparison

| Metric | Python | JavaScript | Java | C++ | Rust |
|--------|--------|------------|------|------|------|
| Execution Speed | Slow | Medium | Fast | Very Fast | Very Fast |
| Memory Usage | High | Medium | Medium | Low | Low |
| Development Speed | Fast | Fast | Medium | Slow | Medium |
| Type Safety | Weak | Weak | Strong | Strong | Very Strong |
| Ecosystem | Rich | Very Rich | Rich | Rich | Growing |

## 6. Lists and Formatting

### Ordered Lists
1. **Project Planning Phase**
   - Requirements analysis
   - Technology selection
   - Team formation

2. **Development Phase**
   - Frontend development
   - Backend development
   - Testing and deployment

3. **Operations Phase**
   - Monitoring and alerting
   - Performance optimization
   - Security hardening

### Unordered Lists
- **Advantages**:
  - Improve efficiency
  - Reduce costs
  - Enhance user experience

- **Challenges**:
  - Technical complexity
  - Learning curve
  - Maintenance costs

### Task Lists
- [x] Requirements analysis completed
- [x] Technical solution designed
- [ ] Prototype development
- [ ] User testing
- [ ] Deployment to production

## 7. Quotes and Notes

> "Artificial Intelligence is a key driver of the new round of technological revolution and industrial transformation, and is a strategic technology that leads future development." — CEO of a major technology company

:::note
This is an important reminder: The development of artificial intelligence needs to be approached carefully, ensuring ethical and security considerations.
:::

:::warning
Warning: Over-reliance on artificial intelligence may lead to skill degradation, please maintain critical thinking.
:::

:::tip
Tip: Regularly updating AI models can achieve better performance.
:::

## 8. Mixed Content Example

Below is a comprehensive technical solution recommendation:

### Problem Analysis
Based on your requirements, I recommend adopting a **microservices architecture** to build this system.

**Core Components**:
\`\`\`mermaid
graph LR
    A[API Gateway] --> B[User Service]
    A --> C[Order Service]
    A --> D[Payment Service]
    B --> E[(User Database)]
    C --> F[(Order Database)]
    D --> G[(Payment Database)]
\`\`\`

### Technology Stack Selection
Based on the following considerations:

1. **Scalability**: Microservices allow independent scaling of each component
2. **Technology Diversity**: Different services can use the most suitable technology stack
3. **Fault Tolerance**: A single service failure does not affect the entire system

Recommended technology stack:

| Service | Technology Stack | Reason |
|---------|------------------|--------|
| User Service | Node.js + Express | Fast development, rich ecosystem |
| Order Service | Java + Spring Boot | Enterprise-level stability and transaction support |
| Payment Service | Go + Gin | High performance, memory safety |

### Mathematical Modeling
System performance model:
$$P = \\frac{1}{1 + e^{-(L - T)}}$$

Where:
- $P$: System performance score (0-1)
- $L$: Load intensity
- $T$: System threshold

### Implementation Plan
\`\`\`javascript
const implementationPlan = {
  phase1: {
    duration: '2 weeks',
    tasks: ['Infrastructure setup', 'Basic service development'],
    deliverables: ['API documentation', 'Database design']
  },
  phase2: {
    duration: '4 weeks',
    tasks: ['Core feature development', 'Integration testing'],
    deliverables: ['Runnable system', 'Test reports']
  },
  phase3: {
    duration: '2 weeks',
    tasks: ['Performance optimization', 'Production deployment'],
    deliverables: ['Production environment', 'Monitoring system']
  }
};
\`\`\`

### Risk Assessment
Potential risks and mitigation strategies:

:::warning
**High Risk Project**
- **Technical debt accumulation** → Regular refactoring, code review
- **Team knowledge silos** → Documentation, knowledge sharing
- **Performance bottlenecks** → Performance monitoring, early planning
:::

## 9. Special Characters and Emojis

🎯 **Goal Achievement** ✅
🔥 **Hot Trends** 📈
🚀 **Quick Start** ⚡
🎨 **Creative Design** ✨
📊 **Data Analysis** 📈
🔒 **Secure & Reliable** 🛡️
🌟 **Premium Experience** 💎

### Status Indicators
- ✅ Completed
- 🔄 In Progress
- ⏳ Pending
- ❌ Cancelled
- 🔄 Cycling

### Priority Markers
- 🔥 Urgent and important
- ⚠️ Important but not urgent
- ℹ️ General information
- 💡 Suggestions and ideas

## 10. Long Text and Paragraph Formatting

This is a longer paragraph example used to test the continuity and format preservation of streaming rendering. In actual AI responses, we often need to generate longer, structured content including multiple paragraphs, lists, code blocks, and various formatting elements.

Such long text can better test the performance and user experience of streaming transmission. As content arrives progressively, users can see how text gradually builds into a complete response structure.

**Key testing points**:
1. Whether text continuity is maintained
2. Whether formatting elements render correctly
3. Whether code blocks display completely
4. Whether mathematical formulas are typeset correctly
5. Whether diagrams load properly

Through these tests, we can ensure that the streaming chat functionality can handle various complex markdown content while maintaining good user experience and content integrity.`;
