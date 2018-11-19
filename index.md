<!-- Insert SpaceCraft logo either above, below, or next to title -->
## SpaceCraft: A Real-Time, Collaborative REPL and Code Editor

## 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node and Docker, with clients and server communicating over WebSockets.

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


## 2.1 Streaming Input to the Backend

## 2.2 Building a Pseudoterminal



## 3 Utilizing Containers

### 3.1 Sementing Users by Container

### 3.2 Securing Containers

### 3.3 Managing Container Resources


## 4 Collaboration with Multiple Users

### 4.1 Connecting Multiple Users to the Same Container

### 4.2 Syncing Input and Output

### 4.3 Handling REPL Conflict Resolution


## 5 Optimizations


## 6 Future Work

### 6.1 Improve User Experiences

### 6.2 Support Low-Level Languages


## 7 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.

