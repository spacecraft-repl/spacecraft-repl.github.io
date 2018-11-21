<!-- Insert SpaceCraft logo either above, below, or next to title -->
## SpaceCraft: A Real-Time, Collaborative REPL and Code Editor

## 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node.js and Docker, with clients and server communicating over WebSockets.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for security and resource usage with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we imployed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our final networked solution. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across containers.

## 1.1 High-Level Goals
SpaceCraft's goals on the surface are simple. We provide users with a choice of languages to code in and present both a terminal-like REPL and editor for them to write and evaluate their code. Additionally, a user can invite other users to join their session to collaborate on writing code in the editor and REPL. Thus, when one user write code or submits code for evaluation, all collaborating users will see their code and executed code on their screen in real-time.

Since we are providing users with a terminal-like REPL on the client-side that directly connects to our backend for code execution, we know that we will need to handle any potentially malicious input from users who aim to exploit our project. Therefore, we need to:
- Isolate each user's session from the sessions of other users (non-collaborating users.)
- Prevent any malicious code from affecting our system.
- Manage the usage of our server's resources for each session so that one user's code doesn't affect other users.

## 2 Building a REPL
Our first task is to create a version of SpaceCraft that services a single user per session. This version should allow the user to:
- Select from a list of supported languages.
- Write code in the REPL, submit for evaluation by hitting Enter, and receive the result as output.
- Write code in the editor, submit for evaluation by clicking a Run button, and receive the result as output.
- Store state in the REPL for later use, such as variables, objects, methods/functions, etc.

In SpaceCraft, a user makes a language selection from a drop-down menu which will automatically update the REPL to their chosen language's runtime. They can then write code directly into the REPL for evaluation or into an embedded editor for writing larger programs. When code is submitted through either the REPL or by clicking a Run button for the editor, SpaceCraft will take the code as input and send it to our backend for evaluation. Once the code has been evaluated, our backend will send the result as output to the client which will present the result in the REPL for users to see.

## 2.1 Creating the User Interface
SpaceCraft's user interface was created with [Xterm.js](https://github.com/xtermjs/xterm.js/) and [CodeMirror](https://codemirror.net/). Xterm is a terminal front-end component written JavaScript that enables us to create an emulated terminal in which users can write their code and submit for evaluation. When a user hits Enter in the terminal front-end, we submit their code as input to our backend for evaluation, and the result is then sent to our frontend to be displayed in our terminal component.

CodeMirror is a versatile text editor implemented in JavaScript for the browser. It's specialized for writing and editing code and provides a familiar text editor experiences for developers. By leveraging Xterm.js and CodeMirror to create our user interface and receive input, our team was able to focus our efforts on developing a rich REPL experience for Ruby, JavaScript, and Python with a secure framework for handling malicious user input. But first, how exactly did we handle our user input and properly evaluate it on our backend? Let's dive in to see!

## 2.1 Streaming Input to the Backend

## 2.2 Building a Pseudoterminal

### 2.1 Interacting with the REPL program on the Back-end

## 3 Utilizing Containers

### 3.1 Segmenting Users by Container

### 3.2 Securing Containers

### 3.3 Managing Container Resources


## 4 Collaboration with Multiple Users

### 4.1 Connecting Multiple Users to the Same Container

### 4.2 Syncing Input

#### Getting the Current Prompt

### 4.3 Syncing Output

### 4.4 Handling REPL Conflict Resolution

#### Getting the Current Prompt

### 4.3 Syncing Output

### 4.4 Handling REPL Conflict Resolution
<!-- OK to not handle conflicts since our use case, we don't expect two users to type in the REPL at the same time -->

## 5 Optimizations

### 5.1 Streaming vs. Buffering Outputs
A REPL program sends outputs in the form of chunks of data. For each evaluation, our application would receive several to many smaller chunks of output data.

To demonstrate this, let's evaluate the code `[1,2,3].map(String)` on the Node REPL. We can reasonably expect the final output to be:

```
> [1,2,3].map(String)
[ '1', '2', '3' ]
>
```

However, since we are writing and reading data directly to and from a pseudo-terminal, the evaluation result is written out through the standard output (a readable stream). This means that the first chunk of data available to be read from the readable stream may not contain our full output.

In fact, the chunks of output data from the same example above may look something like this:

```
[1      # first chunk of data
,2,3].  # second chunk of data
map     # third chunk and so on...
(St
ri
ng
)
\r\n
[ '1', '2', '3' ]\r\n
>       # final chunk of data
```

#### Buffering Outputs
With this effect, it makes sense to concatenate all chunks before sending it as a complete response. This is known as **output buffering**. [Output Buffering for Web Developers](http://web.archive.org/web/20101216035343/http://dev-tips.com/featured/output-buffering-for-web-developers-a-beginners-guide)

After buffering output, it would look something like:

```
[1,2,3].map(String)\r\n[ '1', '2', '3' ]\r\n> 
```

The advantage to this in our use case is that we can easily parse out the current prompt depending on the current runtime (`>` for Node.js, `irb(main):XXX:0>` for Ruby and `>>>` for Python) on the client-side. The prompt is useful for re-writing the entire terminal line when syncing with other clients.

However, buffering outputs cost additional processing time. Since chunks of data arrive in different paces (around 1-4 ms in between), we would set a maximum wait time of 5 ms every time a new data chunk is received. If no new data is received within the 5 ms, we conclude that the output is finished and we can send the complete buffered output to the client.

#### Streaming Outputs
Our initial approach of buffering outputs seem to work fine. However, we found out that we could parse out the prompt on the server-side instead by caching the last chunk of data received. An example data chunk would be `=> 123\r\nirb(main):003:0> `, by caching this data chunk, we can easily parse out the `irb(main):003:0> ` prompt.
With this, it is no longer necessary to buffer outputs. Instead, we could stream the outputs as-is to the client. The benefit of this is that it not only removes any additional processing, but also simplifies our code logic by omitting any use of `setTimeouts` or `setIntervals`.

With these two approaches in mind, we decided to run some benchmarking to confirm that streaming is the better approach. We utilized Artillery, a load testing toolkit to measure the performance of both approaches.

Our benchmarking set-up involves connecting 20 virtual users one at a time to our server, with each submitting 5 evaluation requests, thereby totaling 100 requests per test.

The results clearly show that the streaming approach is the winner:

| Server Location  |  Median Latency with Buffering Enabled (ms)  | Median Latency without Buffering (ms) | Difference |
| --- | --- | --- | --- |
| localhost |  12.3 | 2.1 | 10.2 |
| remote, near (NYC to NYC) | 21.3 |  15.2 | 6.1 |
| remote, far (NYC to SF) | 89.3 | 78.9 | 10.4 |

While a 10 ms improvement in latency may not seem like a huge difference, it represents more than 10% of the total time before a response is received, after an evaluation request has been sent. Our goal here is to minimize the latency to maintain a real-time experience for users, therefore it makes sense to employ streaming instead of buffering.

## 6 Future Work

### 6.1 Improve User Experiences

### 6.2 Support Low-Level Languages


## 7 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.

